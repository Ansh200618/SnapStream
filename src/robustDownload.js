/**
 * Robust image download utility
 * Fetches image data, validates Content-Type, and downloads with correct extension
 * Prevents downloading HTML pages disguised as images
 */

/**
 * Map MIME types to file extensions
 */
const MIME_TYPE_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/tiff': 'tiff',
  'image/x-tiff': 'tiff',
  'image/jfif': 'jfif',
};

/**
 * Extract extension from Content-Type header
 * @param {string} contentType - The Content-Type header value
 * @returns {string|null} - The file extension or null
 */
function getExtensionFromContentType(contentType) {
  if (!contentType) return null;
  
  // Remove charset and other parameters
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  
  return MIME_TYPE_TO_EXTENSION[mimeType] || null;
}

/**
 * Check if Content-Type indicates an HTML page
 * @param {string} contentType - The Content-Type header value
 * @returns {boolean}
 */
function isHtmlContentType(contentType) {
  if (!contentType) return false;
  
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  return mimeType === 'text/html' || mimeType === 'application/xhtml+xml';
}

/**
 * Check if Content-Type indicates an image
 * @param {string} contentType - The Content-Type header value
 * @returns {boolean}
 */
function isImageContentType(contentType) {
  if (!contentType) return false;
  
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  return mimeType.startsWith('image/');
}

/**
 * Download image robustly by fetching first and validating content
 * @param {string} url - The URL to download
 * @param {Object} options - Download options
 * @param {string} options.filename - Optional filename to save as
 * @param {boolean} options.saveAs - Whether to show save dialog
 * @returns {Promise<Object>} - Promise resolving to download result
 */
export async function downloadImageRobustly(url, options = {}) {
  try {
    // 1. Fetch the data first (don't just download the URL)
    const response = await fetch(url);

    // 2. Check if the fetch was actually successful
    if (!response.ok) {
      console.error(`[SnapStream] Server returned status: ${response.status} for URL: ${url}`);
      return {
        success: false,
        error: `Server returned status ${response.status}`,
        url: url,
      };
    }

    // 3. GET THE REAL MIME TYPE
    const contentType = response.headers.get('content-type');
    
    // If the server says it's HTML, stop! It's not an image.
    if (isHtmlContentType(contentType)) {
      console.warn(`[SnapStream] Aborting: URL returned an HTML page, not an image: ${url}`);
      console.warn(`[SnapStream] Content-Type was: ${contentType}`);
      return {
        success: false,
        error: 'URL returned an HTML page, not an image',
        url: url,
        contentType: contentType,
      };
    }

    // Verify it's actually an image
    if (!isImageContentType(contentType)) {
      console.warn(`[SnapStream] Warning: Content-Type is not an image type: ${contentType} for URL: ${url}`);
      // Don't fail here - the content might still be an image
    }

    // 4. Determine extension based on the Header, not the URL
    let extension = getExtensionFromContentType(contentType) || 'jpg'; // Default to jpg

    // 5. Convert to Blob
    const blob = await response.blob();
    
    // 6. Create a temporary URL for the Blob
    const objectUrl = URL.createObjectURL(blob);

    // 7. Determine filename
    let filename = options.filename;
    if (!filename) {
      // Extract filename from URL or create a timestamped one
      const urlPath = new URL(url).pathname;
      const urlFilename = urlPath.split('/').pop();
      
      if (urlFilename && urlFilename.includes('.')) {
        // Use the URL filename but replace the extension
        filename = urlFilename.replace(/\.[^.]+$/, `.${extension}`);
      } else {
        filename = `image_${Date.now()}.${extension}`;
      }
    } else if (!filename.includes('.')) {
      // Add extension if not present
      filename = `${filename}.${extension}`;
    } else {
      // Replace extension with the correct one
      filename = filename.replace(/\.[^.]+$/, `.${extension}`);
    }

    // 8. Trigger the actual download
    return new Promise((resolve) => {
      chrome.downloads.download({
        url: objectUrl,
        filename: filename,
        saveAs: options.saveAs || false,
      }, (downloadId) => {
        // Clean up memory
        URL.revokeObjectURL(objectUrl);
        
        if (chrome.runtime.lastError) {
          console.error(`[SnapStream] Download failed:`, chrome.runtime.lastError);
          resolve({
            success: false,
            error: chrome.runtime.lastError.message,
            url: url,
          });
        } else {
          resolve({
            success: true,
            downloadId: downloadId,
            url: url,
            filename: filename,
            extension: extension,
          });
        }
      });
    });

  } catch (error) {
    console.error(`[SnapStream] Download failed for URL: ${url}`, error);
    return {
      success: false,
      error: error.message,
      url: url,
    };
  }
}

/**
 * Download multiple images with the robust method
 * @param {string[]} urls - Array of URLs to download
 * @param {Object} options - Download options (applied to all downloads)
 * @returns {Promise<Object>} - Promise resolving to summary of results
 */
export async function downloadImagesRobustly(urls, options = {}) {
  const results = {
    total: urls.length,
    successful: 0,
    failed: 0,
    details: [],
  };

  for (const url of urls) {
    const result = await downloadImageRobustly(url, options);
    results.details.push(result);
    
    if (result.success) {
      results.successful++;
    } else {
      results.failed++;
    }
  }

  return results;
}
