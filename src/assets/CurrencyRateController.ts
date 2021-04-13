import { Mutex } from 'async-mutex';
import type { Patch } from 'immer';

import { BaseController } from '../BaseControllerV2';
import { safelyExecute } from '../util';
import { fetchExchangeRate as defaultFetchExchangeRate } from '../apis/crypto-compare';

import type { RestrictedControllerMessenger } from '../ControllerMessenger';

/**
 * @type CurrencyRateState
 *
 * @property conversionDate - Timestamp of conversion rate expressed in ms since UNIX epoch
 * @property conversionRate - Conversion rate from current base asset to the current currency
 * @property currentCurrency - Currently-active ISO 4217 currency code
 * @property nativeCurrency - Symbol for the base asset used for conversion
 * @property pendingCurrentCurrency - The currency being switched to
 * @property pendingNativeCurrency - The base asset currency being switched to
 * @property usdConversionRate - Conversion rate from usd to the current currency
 */
export type CurrencyRateState = {
  conversionDate: number;
  conversionRate: number;
  currentCurrency: string;
  nativeCurrency: string;
  pendingCurrentCurrency: string | null;
  pendingNativeCurrency: string | null;
  usdConversionRate: number | null;
};

export type CurrencyRateStateChange = {
  type: `CurrencyRateController:stateChange`;
  payload: [CurrencyRateState, Patch[]];
};

const metadata = {
  conversionDate: { persist: true, anonymous: true },
  conversionRate: { persist: true, anonymous: true },
  currentCurrency: { persist: true, anonymous: true },
  nativeCurrency: { persist: true, anonymous: true },
  pendingCurrentCurrency: { persist: false, anonymous: true },
  pendingNativeCurrency: { persist: false, anonymous: true },
  usdConversionRate: { persist: false, anonymous: true },
};

const defaultState = {
  conversionDate: 0,
  conversionRate: 0,
  currentCurrency: 'usd',
  nativeCurrency: 'ETH',
  pendingCurrentCurrency: null,
  pendingNativeCurrency: null,
  usdConversionRate: null,
};

/**
 * Controller that passively polls on a set interval for an exchange rate from the current base
 * asset to the current currency
 */
export class CurrencyRateController extends BaseController<
  'CurrencyRateController',
  CurrencyRateState
> {
  private mutex = new Mutex();

  private handle?: NodeJS.Timer;

  private interval;

  private fetchExchangeRate;

  private includeUsdRate;

  /**
   * Creates a CurrencyRateController instance
   *
   * @param options - Constructor options
   * @param options.includeUsdRate - Keep track of the USD rate in addition to the current currency rate
   * @param options.interval - The polling interval, in milliseconds
   * @param options.messenger - A reference to the messaging system
   * @param options.state - Initial state to set on this controller
   * @param fetchExchangeRate - Fetches the exchange rate from an external API
   */
  constructor(
    {
      includeUsdRate = false,
      interval = 180000,
      messenger,
      state,
    }: {
      includeUsdRate?: boolean;
      interval?: number;
      messenger: RestrictedControllerMessenger<
        'CurrencyRateController',
        any,
        CurrencyRateStateChange,
        never,
        never
      >;
      state?: Partial<CurrencyRateState>;
    },
    /* istanbul ignore next */ fetchExchangeRate = defaultFetchExchangeRate,
  ) {
    super({
      name: 'CurrencyRateController',
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.includeUsdRate = includeUsdRate;
    this.interval = interval;
    this.fetchExchangeRate = fetchExchangeRate;
    this.poll();
  }

  /**
   * Prepare to discard this controller.
   *
   * This stops any active polling.
   */
  destroy() {
    super.destroy();
    if (this.handle) {
      clearTimeout(this.handle);
    }
  }

  /**
   * Sets a currency to track
   *
   * TODO: Replace this wth a method
   *
   * @param currentCurrency - ISO 4217 currency code
   */
  async setCurrentCurrency(currentCurrency: string) {
    this.update((state) => {
      state.pendingCurrentCurrency = currentCurrency;
    });
    await this.updateExchangeRate();
  }

  get currentCurrency() {
    throw new Error('Property only used for setting');
  }

  /**
   * Sets a new native currency
   *
   * TODO: Replace this wth a method
   *
   * @param symbol - Symbol for the base asset
   */
  async setNativeCurrency(symbol: string) {
    this.update((state) => {
      state.pendingNativeCurrency = symbol;
    });
    await this.updateExchangeRate();
  }

  get nativeCurrency() {
    throw new Error('Property only used for setting');
  }

  /**
   * Starts a new polling interval
   */
  async poll(): Promise<void> {
    this.handle && clearTimeout(this.handle);
    await safelyExecute(() => this.updateExchangeRate());
    this.handle = setTimeout(() => {
      this.poll();
    }, this.interval);
  }

  /**
   * Updates exchange rate for the current currency
   */
  async updateExchangeRate(): Promise<CurrencyRateState | void> {
    const releaseLock = await this.mutex.acquire();
    const {
      currentCurrency,
      nativeCurrency,
      pendingCurrentCurrency,
      pendingNativeCurrency,
    } = this.state;
    try {
      const {
        conversionDate,
        conversionRate,
        usdConversionRate,
      } = await this.fetchExchangeRate(
        pendingCurrentCurrency || currentCurrency,
        pendingNativeCurrency || nativeCurrency,
        this.includeUsdRate,
      );
      this.update(() => {
        return {
          conversionDate,
          conversionRate,
          currentCurrency: pendingCurrentCurrency || currentCurrency,
          nativeCurrency: pendingNativeCurrency || nativeCurrency,
          pendingCurrentCurrency: null,
          pendingNativeCurrency: null,
          usdConversionRate,
        };
      });
    } finally {
      releaseLock();
    }
  }
}

export default CurrencyRateController;
