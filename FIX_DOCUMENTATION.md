# Fix for .htm Extension Issue

## Problem
SnapStream was sometimes downloading HTML wrapper pages instead of actual images, resulting in files with `.htm` extensions instead of proper image extensions like `.jpg`, `.png`, etc.

## Root Cause
The extension was using `chrome.downloads.download({ url: imageUrl })` directly without validating what the URL actually returns. Many websites use "viewer pages" where:
- The link in an `<a>` tag leads to an HTML page that displays the image
- The actual image is embedded within that HTML page
- When downloaded directly, you get HTML content instead of the image

## Solution
Implemented a robust download mechanism that:

1. **Fetches the URL first** using the `fetch()` API
2. **Validates the response**:
   - Checks for successful HTTP status (200 OK)
   - Inspects the `Content-Type` header
   - Rejects downloads if `Content-Type` is `text/html`
3. **Determines correct extension** from the `Content-Type` header
4. **Creates a Blob** from the response
5. **Downloads with proper extension** using a temporary object URL

## Implementation Files

### New Files
- **`src/robustDownload.js`**: Core utility module
  - `downloadImageRobustly(url, options)` - Main function
  - MIME type to extension mapping
  - Content-Type validation helpers

### Updated Files
- **`src/ImageActions.js`**: Individual image download button
- **`src/popup.js`**: Bulk download functionality
- **`src/background/setReferrer.js`**: Added support for fetch requests

## Usage Examples

### Single Image Download
```javascript
import { downloadImageRobustly } from './robustDownload.js';

const result = await downloadImageRobustly('https://example.com/image.jpg');
if (result.success) {
  console.log(`Downloaded as: ${result.filename}`);
} else {
  console.error(`Failed: ${result.error}`);
}
```

### Bulk Download with Custom Filenames
```javascript
for (let i = 0; i < imageUrls.length; i++) {
  const result = await downloadImageRobustly(imageUrls[i], {
    filename: `myimage_${i}.jpg`,
    saveAs: false
  });
}
```

## Supported Image Types

The solution supports all common image MIME types:
- `image/jpeg` → `.jpg`
- `image/png` → `.png`
- `image/gif` → `.gif`
- `image/webp` → `.webp`
- `image/svg+xml` → `.svg`
- `image/bmp` → `.bmp`
- `image/x-icon` → `.ico`
- `image/tiff` → `.tiff`
- And more...

## Error Handling

The solution gracefully handles:
- **HTML pages**: Detects and rejects with clear error message
- **HTTP errors**: Logs status code and stops download
- **Network failures**: Catches and reports fetch errors
- **Invalid Content-Types**: Falls back to URL extension detection

## Notifications

Users are notified when downloads fail:
- Individual downloads show console errors
- Bulk downloads show a summary notification with success/failure counts

## Technical Details

### Object URL Cleanup
Object URLs are properly cleaned up after downloads complete by listening to `chrome.downloads.onChanged` events. This prevents memory leaks.

### Referrer Headers
The background script sets proper `Referer` and `Origin` headers for fetch requests to handle sites with hotlink protection.

### Extension Detection Strategy
1. Try to extract from `Content-Type` header (most reliable)
2. Fall back to URL path extension
3. Last resort: default to `.jpg` with a warning

## Testing

Build the extension:
```bash
npm install
npm run build
```

Load the extension in Chrome:
1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the project root directory

Test with various image URLs including:
- Direct image links
- Image viewer pages (should be rejected)
- Images with query parameters
- Different image formats

## Benefits

✅ **Prevents downloading HTML pages as images**  
✅ **Automatic extension detection**  
✅ **Better error messages**  
✅ **Works with hotlink protection**  
✅ **Memory efficient with proper cleanup**  
✅ **No breaking changes to existing functionality**

## Security

- CodeQL security scan: ✅ No vulnerabilities
- No sensitive data exposed
- Proper error handling
- Safe blob URL handling
