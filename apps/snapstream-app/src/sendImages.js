(() => {
  // Source: https://support.google.com/webmasters/answer/2598805?hl=en
  const imageUrlRegex = /(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*))?([^?#]*\.(?:bmp|gif|ico|jfif|jpe?g|png|svg|tiff?|webp))(?:\?([^#]*))?(?:#(.*))?/i;

  function extractImagesFromSelector(selector) {
    return unique(
      toArray(document.querySelectorAll(selector))
        .map(extractImageFromElement)
        .filter(isTruthy)
        .map(relativeUrlToAbsolute)
    );
  }

  function extractImageFromElement(element) {
    if (element.tagName.toLowerCase() === 'img') {
      const src = element.src;
      const hashIndex = src.indexOf('#');
      return hashIndex >= 0 ? src.substr(0, hashIndex) : src;
    }

    if (element.tagName.toLowerCase() === 'image') {
      const src = element.getAttribute('xlink:href');
      if (src) {
        const hashIndex = src.indexOf('#');
        return hashIndex >= 0 ? src.substr(0, hashIndex) : src;
      }
      return null;
    }

    if (element.tagName.toLowerCase() === 'a') {
      const href = element.href;
      if (isImageURL(href)) {
        return href;
      }
    }

    const backgroundImage = window.getComputedStyle(element).backgroundImage;
    if (backgroundImage) {
      const parsedURL = extractURLFromStyle(backgroundImage);
      if (isImageURL(parsedURL)) {
        return parsedURL;
      }
    }
  }

  function isImageURL(url) {
    return url.indexOf('data:image') === 0 || imageUrlRegex.test(url);
  }

  function extractURLFromStyle(url) {
    return url.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
  }

  function relativeUrlToAbsolute(url) {
    return url.indexOf('/') === 0 ? `${window.location.origin}${url}` : url;
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function toArray(values) {
    return [...values];
  }

  function isTruthy(value) {
    return !!value;
  }

  // Function to scroll and collect images
  async function scrollAndCollectImages() {
    const scrollStep = 500; // pixels to scroll each time
    const scrollDelay = 300; // ms to wait after each scroll
    let lastHeight = document.body.scrollHeight;
    let attempts = 0;
    const maxAttempts = 50; // Prevent infinite scrolling
    
    // Initial collection
    let allImages = extractImagesFromSelector('img, image, a, [class], [style]');
    let linkedImages = extractImagesFromSelector('a');
    
    // Send initial batch
    chrome.runtime.sendMessage({
      allImages: allImages,
      linkedImages: linkedImages,
      origin: window.location.origin,
    });
    
    // Scroll to load lazy images
    while (attempts < maxAttempts) {
      window.scrollBy(0, scrollStep);
      
      await new Promise(resolve => setTimeout(resolve, scrollDelay));
      
      const currentHeight = document.body.scrollHeight;
      const scrolledToBottom = (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 100;
      
      // Collect new images after scroll
      const newAllImages = extractImagesFromSelector('img, image, a, [class], [style]');
      const newLinkedImages = extractImagesFromSelector('a');
      
      // Send updates if new images found
      if (newAllImages.length > allImages.length || newLinkedImages.length > linkedImages.length) {
        chrome.runtime.sendMessage({
          allImages: newAllImages,
          linkedImages: newLinkedImages,
          origin: window.location.origin,
        });
        allImages = newAllImages;
        linkedImages = newLinkedImages;
      }
      
      // Check if we've reached the bottom or page stopped growing
      if (scrolledToBottom && currentHeight === lastHeight) {
        break;
      }
      
      lastHeight = currentHeight;
      attempts++;
    }
    
    // Scroll back to top
    window.scrollTo(0, 0);
  }
  
  // Run the scroll and collect function (wrapped in async IIFE)
  (async () => {
    await scrollAndCollectImages();
  })();
})();
