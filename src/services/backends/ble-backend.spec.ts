import { BLEBackend } from './ble-backend';
import { Bluetooth } from '@nativescript-community/ble';

describe('BLEBackend', () => {
  let backend: BLEBackend;
  let mockedBluetooth: jest.Mocked<Bluetooth>;

  beforeEach(() => {
    jest.useFakeTimers(); // Enable fake timers
    // Now, we instantiate the mocked Bluetooth class
    mockedBluetooth = new Bluetooth() as jest.Mocked<Bluetooth>;
    backend = new BLEBackend();
    // We need to manually set the bluetooth instance to our mocked one
    (backend as any).bluetooth = mockedBluetooth;
    // Mock peripheral for sendCommand tests
    (backend as any).peripheral = { UUID: 'test-uuid' };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers(); // Run any remaining timers
    jest.useRealTimers(); // Restore real timers
  });

  describe('handleNotification', () => {
    let responseResolver: jest.Mock;
    let responseRejecter: jest.Mock;

    beforeEach(() => {
      responseResolver = jest.fn();
      responseRejecter = jest.fn();
      (backend as any).responseResolver = responseResolver;
      (backend as any).responseRejecter = responseRejecter;
    });

    const textToArrayBuffer = (text: string): ArrayBuffer => {
      return new TextEncoder().encode(text).buffer as ArrayBuffer;
    };

    it('should handle a single-chunk response without a header', () => {
      const response = 'OK';
      (backend as any)._currentResponseType = 'text'; // Set response type to text
      backend.handleNotification(textToArrayBuffer(response));
      jest.runAllTimers(); // Advance timers
      expect(responseResolver).toHaveBeenCalledWith('OK');
    });

    it('should handle a single-chunk response with a header', () => {
      const header = '21,1,21\n';
      const data = '{"status":"success"}';
      const response = header + data;
      backend.handleNotification(textToArrayBuffer(response));
      jest.runAllTimers(); // Advance timers
      expect(responseResolver).toHaveBeenCalledWith({"status":"success"});
    });

    it('should handle a multi-chunk response', () => {
      const header = '28,3,10\n';
      const chunk1 = '{"part1":"hello"';
      const chunk2 = ',"part2":"worl';
      const chunk3 = 'd"}';

      backend.handleNotification(textToArrayBuffer(header + chunk1));
      expect(responseResolver).not.toHaveBeenCalled();
      backend.handleNotification(textToArrayBuffer(chunk2));
      expect(responseResolver).not.toHaveBeenCalled();
      backend.handleNotification(textToArrayBuffer(chunk3));
      jest.runAllTimers(); // Advance timers
      expect(responseResolver).toHaveBeenCalledWith({"part1":"hello","part2":"world"});
    });

    it('should handle a malformed header by treating it as a single chunk', () => {
      const malformedHeader = 'this is not a header';
      (backend as any)._currentResponseType = 'text'; // Set response type to text
      backend.handleNotification(textToArrayBuffer(malformedHeader));
      jest.runAllTimers(); // Advance timers
      expect(responseResolver).toHaveBeenCalledWith('this is not a header');
    });

    it('should not resolve if not all chunks are received', () => {
      const header = '30,3,10\n';
      const chunk1 = '{"part1":"hello';
      const chunk2 = '","part2":"world';

      backend.handleNotification(textToArrayBuffer(header + chunk1));
      backend.handleNotification(textToArrayBuffer(chunk2));

      expect(responseResolver).not.toHaveBeenCalled();
    });
  });

  });
