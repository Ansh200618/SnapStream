// TODO: Rename to avoid potential conflict with `utils.js`
import { mockRecursivePartial } from 'sneer';

export const mockChrome = () =>
  mockRecursivePartial<typeof chrome>({
    downloads: {
      onDeterminingFilename: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    },
    runtime: {
      onInstalled: {
        addListener: jest.fn(),
      },
      onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
      sendMessage: jest.fn(),
      getManifest: jest.fn(() => ({ version: '4.0.0' })),
    },
    tabs: {
      create: jest.fn(),
      executeScript: jest.fn(),
      query: jest.fn(),
    },
    windows: {
      getCurrent: jest.fn(),
    },
  });

export const asMockedFunction = <T extends (...args: any[]) => any>(fn: T) =>
  fn as jest.MockedFunction<T>;
