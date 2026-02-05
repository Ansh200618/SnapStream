import { asMockedFunction, mockChrome } from './test-utils';

jest.useFakeTimers();

declare var global: any;

beforeEach(() => {
  global.chrome = mockChrome();
  
  // Mock tabs.query to call the callback with active tabs
  asMockedFunction(chrome.tabs.query).mockImplementation((_, callback: any) => {
    callback([{ id: 1 }]);
  });
  
  // Mock windows.getCurrent to call the callback with window
  asMockedFunction(chrome.windows.getCurrent).mockImplementation((callback: any) => {
    callback({ id: 'window' });
  });
  
  global.this = global;
  global.$ = require('../lib/jquery-3.5.1.min');
  ($.fn as any).fadeIn = function (duration, fn) {
    setTimeout(duration, fn);
    return this;
  };
  ($.fn as any).fadeOut = function (duration, fn) {
    setTimeout(duration, fn);
    return this;
  };
  ($ as any).Link = jest.fn();
  ($.fn as any).noUiSlider = jest.fn();
  
  // Mock noUiSlider globally
  global.noUiSlider = {
    create: jest.fn((element, options) => {
      element.noUiSlider = {
        on: jest.fn(),
        destroy: jest.fn(),
        get: jest.fn(() => [0, 100]),
      };
    }),
  };
  
  document.body.innerHTML = '<main></main>';
  require('./defaults');
  require('./popup');
  
  // Run any pending timers to allow effects to execute
  jest.runAllTimers();
});

it(`renders images`, () => {
  const renderImages = asMockedFunction(chrome.runtime.onMessage.addListener)
    .mock.calls[0]?.[0];
    
  if (!renderImages) {
    throw new Error('renderImages callback was not registered');
  }
  
  renderImages(
    {
      allImages: [
        'http://example.com/image-1.png',
        'http://example.com/image-2.png',
        'http://example.com/image-3.png',
      ],
      linkedImages: [],
    },
    {},
    () => {}
  );
  
  // Run timers to process the debounced filter
  jest.runAllTimers();
  
  // Trigger load events on the cached images to simulate them loading
  document.querySelectorAll('.hidden img').forEach((img: any) => {
    Object.defineProperty(img, 'naturalWidth', { value: 100, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 100, configurable: true });
    img.dispatchEvent(new Event('load'));
  });
  
  // Run timers again to process any filtering after image load
  jest.runAllTimers();

  expect(document.querySelectorAll('#images_container img').length).toBe(3);
});
