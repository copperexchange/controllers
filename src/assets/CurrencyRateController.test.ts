import 'isomorphic-fetch';
import { stub } from 'sinon';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  CurrencyRateController,
  CurrencyRateStateChange,
} from './CurrencyRateController';

const name = 'CurrencyRateController';

function getRestrictedMessenger() {
  const controllerMessenger = new ControllerMessenger<
    any,
    CurrencyRateStateChange
  >();
  const messenger = controllerMessenger.getRestricted<
    'CurrencyRateController',
    never,
    never
  >({
    name,
  });
  return messenger;
}

describe('CurrencyRateController', () => {
  it('should set default state', () => {
    const fetchExchangeRateStub = stub();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController(
      { messenger },
      fetchExchangeRateStub,
    );
    expect(controller.state).toStrictEqual({
      conversionDate: 0,
      conversionRate: 0,
      currentCurrency: 'usd',
      nativeCurrency: 'ETH',
      pendingCurrentCurrency: null,
      pendingNativeCurrency: null,
      usdConversionRate: null,
    });

    controller.destroy();
  });

  it('should initialize with initial state', () => {
    const fetchExchangeRateStub = stub();
    const messenger = getRestrictedMessenger();
    const existingState = { currentCurrency: 'rep' };
    const controller = new CurrencyRateController(
      { messenger, state: existingState },
      fetchExchangeRateStub,
    );
    expect(controller.state).toStrictEqual({
      conversionDate: 0,
      conversionRate: 0,
      currentCurrency: 'rep',
      nativeCurrency: 'ETH',
      pendingCurrentCurrency: null,
      pendingNativeCurrency: null,
      usdConversionRate: null,
    });

    controller.destroy();
  });

  it('should throw when currentCurrency property is accessed', () => {
    const fetchExchangeRateStub = stub();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController(
      { messenger },
      fetchExchangeRateStub,
    );
    expect(() => console.log(controller.currentCurrency)).toThrow(
      'Property only used for setting',
    );
  });

  it('should throw when nativeCurrency property is accessed', () => {
    const fetchExchangeRateStub = stub();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController(
      { messenger },
      fetchExchangeRateStub,
    );
    expect(() => console.log(controller.nativeCurrency)).toThrow(
      'Property only used for setting',
    );
  });

  it('should poll and update rate in the right interval', async () => {
    const fetchExchangeRateStub = stub();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController(
      { interval: 100, messenger },
      fetchExchangeRateStub,
    );

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 1));
    expect(fetchExchangeRateStub.called).toBe(true);
    expect(fetchExchangeRateStub.calledTwice).toBe(false);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(fetchExchangeRateStub.calledTwice).toBe(true);

    controller.destroy();
  });

  it('should clear previous interval', async () => {
    const fetchExchangeRateStub = stub();
    const messenger = getRestrictedMessenger();
    const mock = stub(global, 'clearTimeout');
    const controller = new CurrencyRateController(
      { interval: 1337, messenger },
      fetchExchangeRateStub,
    );
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        controller.poll();
        expect(mock.called).toBe(true);
        mock.restore();

        controller.destroy();
        resolve();
      }, 100);
    });
  });

  it('should update exchange rate', async () => {
    const fetchExchangeRateStub = stub().resolves({ conversionRate: 10 });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController(
      { interval: 10, messenger },
      fetchExchangeRateStub,
    );
    expect(controller.state.conversionRate).toStrictEqual(0);
    await controller.updateExchangeRate();
    expect(controller.state.conversionRate).toStrictEqual(10);

    controller.destroy();
  });

  it('should update current currency', async () => {
    const fetchExchangeRateStub = stub().resolves({ conversionRate: 10 });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController(
      { interval: 10, messenger },
      fetchExchangeRateStub,
    );
    expect(controller.state.conversionRate).toStrictEqual(0);
    await controller.setCurrentCurrency('CAD');
    expect(controller.state.conversionRate).toStrictEqual(10);

    controller.destroy();
  });

  it('should update native currency', async () => {
    const fetchExchangeRateStub = stub().resolves({ conversionRate: 10 });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController(
      { interval: 10, messenger },
      fetchExchangeRateStub,
    );
    expect(controller.state.conversionRate).toStrictEqual(0);
    await controller.setNativeCurrency('xDAI');
    expect(controller.state.conversionRate).toStrictEqual(10);

    controller.destroy();
  });

  it('should add usd rate to state when includeUsdRate is configured true', async () => {
    const fetchExchangeRateStub = stub().resolves({});
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController(
      { includeUsdRate: true, messenger, state: { currentCurrency: 'xyz' } },
      fetchExchangeRateStub,
    );

    await controller.updateExchangeRate();

    expect(
      fetchExchangeRateStub.alwaysCalledWithExactly('xyz', 'ETH', true),
    ).toBe(true);

    controller.destroy();
  });
});
