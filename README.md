# 🎯 SnapStream - Image Downloader

[![Version](https://img.shields.io/badge/version-4.0.0-blue.svg)](https://github.com/Ansh200618/WEB_Works)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-V2-orange.svg)](manifest.json)

**Effortlessly discover, filter, and download images from any website**

![SnapStream Demo](https://github.com/user-attachments/assets/66cd0a4b-6eed-4ac0-817a-950f1fda1214)

## ✨ Features

### 🔍 Smart Image Detection
- Automatically detects all images on any webpage
- Supports `<img>` tags, CSS background images, srcset attributes
- Finds images in `<picture>` elements and linked images
- Real-time image counting as you browse

### 🎯 Advanced Filtering
- Filter by image type (JPG, PNG, GIF, WEBP)
- Set minimum width and height thresholds
- Live preview as you adjust filters
- Excludes tracking pixels and tiny images automatically

### 📥 Bulk Download
- Download all filtered images with one click
- Clean, sequential file naming (snapstream_domain_1.jpg, etc.)
- Smart batching to prevent browser overwhelm
- Loading states with progress indication

### 🎨 Modern UI
- Beautiful gradient design (Deep Indigo to Purple)
- Dark/Light mode compatible
- Responsive layout optimized for popup window
- Intuitive controls and settings

### 📸 Image Preview Grid
- Thumbnail preview of detected images
- Hover effects with download icon overlay
- Click individual images to download instantly
- Displays filtered images with count indicator

## 🚀 Installation

### Desktop Application (NEW! 🎉)

SnapStream now has a standalone **desktop application** with an inbuilt browser and ad blocker!

**Features:**
- ✅ Inbuilt web browser (no Chrome/Edge needed)
- ✅ Built-in ad blocker powered by @cliqz/adblocker-electron (like uBlock Origin)
- ✅ Same beautiful UI as the extension
- ✅ All image detection and download features
- ✅ Cross-platform (Windows, macOS, Linux)

**Quick Start:**
```bash
cd apps/snapstream-app
npm install
npm start
```

[View Desktop App Documentation →](apps/snapstream-app/README.md)

### For Users (Chrome Web Store)
*Coming Soon*

### For Users (Quick Install - No Build Required)

1. **Download the repository**
   - Click the green "Code" button on GitHub
   - Select "Download ZIP"
   - Extract the ZIP file to a folder on your computer

2. **Load in Chrome/Edge**
   - Open `chrome://extensions` in your browser
   - Enable **Developer mode** (toggle in top right)
   - Click **Load unpacked**
   - Select the extracted SnapStream folder (the root directory containing manifest.json)
   - The SnapStream icon will appear in your extensions toolbar!

**Note:** After installation, the extension will automatically open the GitHub repository page to welcome you!

### For Developers (Local Installation with Build)

1. **Clone the repository**
   ```bash
   git clone https://github.com/Ansh200618/WEB_Works.git
   cd WEB_Works
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load in Chrome/Edge**
   - Open `chrome://extensions` in your browser
   - Enable **Developer mode** (toggle in top right)
   - Click **Load unpacked**
   - Select the `build/` folder from the project directory
   - The SnapStream icon will appear in your extensions toolbar!

**Note:** Building is recommended for development as it includes additional checks and optimizations.

## 💻 Development

### Prerequisites
- Node.js 14+
- npm 6+

### Commands

```bash
# Development mode with file watching
npm start

# Build for production
npm run build

# Run tests with watch mode
npm test

# Run all tests with coverage
npm run test.all
```

### Project Structure

```
WEB_Works/
├── apps/
│   └── snapstream-app/       # Desktop application (Electron)
│       ├── main.js           # Electron main process with ad blocker
│       ├── app.js            # Combined browser + SnapStream UI
│       ├── preload.js        # IPC bridge
│       ├── index.html        # App layout
│       └── README.md         # Desktop app documentation
├── src/
│   ├── popup.js              # Main popup component
│   ├── sendImages.js         # Content script for image detection
│   ├── defaults.js           # Default settings
│   ├── background/
│   │   ├── handleUpdates.js  # Install/update handler
│   │   └── setReferrer.js    # Referrer management
│   ├── components/
│   │   └── *.js              # Reusable UI components
│   └── hooks/
│       └── *.js              # Custom React hooks
├── views/
│   ├── popup.html            # Popup HTML shell
│   └── options.html          # Options page
├── stylesheets/
│   └── main.css              # Main styles
├── manifest.json             # Extension manifest (V2)
└── package.json
```

## 🎯 How It Works

### Image Detection Algorithm

SnapStream uses a sophisticated multi-layered approach to find images:

1. **DOM Traversal**
   - Scans all `<img>` elements
   - Extracts src, srcset, and data-* attributes
   - Collects natural dimensions

2. **CSS Analysis**
   - Parses computed styles for background-image
   - Extracts URLs from CSS url() functions
   - Detects inline styles and external stylesheets

3. **Picture Elements**
   - Analyzes `<picture>` and `<source>` tags
   - Handles responsive image sources
   - Processes media query variations

4. **Linked Images**
   - Finds `<a>` tags with image extensions in href
   - Pattern matches against common image formats
   - Resolves relative URLs to absolute

### Download Process

```javascript
// Simplified download flow
1. User clicks "Download All"
2. Extension iterates through filtered images
3. Chrome Downloads API saves each file
4. Clean naming: snapstream_example.com_001.jpg
5. Small delay between downloads (100ms)
6. Progress indication via loading state
```

## 🛠️ Technology Stack

| Category | Technology |
|----------|-----------|
| Framework | React 17 (via HTM) |
| Language | JavaScript ES6+ |
| Styling | Custom CSS |
| Build Tool | Node.js scripts |
| Extension | Manifest V2 |
| Testing | Jest 26 |

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines
- Use existing code style and conventions
- Add tests for new features
- Update documentation as needed
- Test the extension locally before submitting

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

Copyright (c) 2026 Ansh200618

## 🙏 Acknowledgments

- Built with React and HTM
- Styled with custom CSS
- Icons from various sources
- Community contributions

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/Ansh200618/WEB_Works/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Ansh200618/WEB_Works/discussions)

---

**Made with ❤️ by [Ansh200618](https://github.com/Ansh200618)**
