<div align="center">

# 📸 SnapStream

**Discover, filter, preview, and download images from webpages with a focused browser tool.**

![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Frontend-F7DF1E?style=for-the-badge&logo=javascript&logoColor=000)
![Version](https://img.shields.io/badge/Version-4.0.0-2563EB?style=for-the-badge)
![Stars](https://img.shields.io/github/stars/anshdeepofficial/SnapStream?style=for-the-badge&logo=github)

<a href="https://github.com/sponsors/anshdeepofficial"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsor on GitHub" /></a>
<a href="https://buymeacoffee.com/anshdeepofficial"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000" alt="Buy Me a Coffee" /></a>

</div>

---

## ✨ Overview

SnapStream is built for quickly finding useful images on webpages without manually opening and saving them one by one. It detects images from common page sources, filters unwanted results, provides previews, and supports direct individual or bulk downloads.

## 🚀 Highlights

- Detect standard `<img>` elements
- Read `srcset` and `<picture>` sources
- Discover CSS background images
- Detect linked image assets
- Filter by JPG, PNG, GIF, and WebP
- Apply minimum width and height filters
- Exclude tiny/tracking images
- Preview detected images in a grid
- Download individual images directly
- Bulk-download filtered results
- Responsive extension interface
- Manifest V3 architecture

## 🎯 Designed For

SnapStream is useful for designers, developers, researchers, content teams, and anyone who regularly needs to collect publicly accessible image assets from webpages they are authorized to use.

## 🛠️ Tech Stack

| Area | Technology |
| --- | --- |
| Extension platform | Chrome / Chromium Manifest V3 |
| Frontend | HTML, CSS, JavaScript |
| Image discovery | DOM, attributes, CSS sources |
| Downloads | Browser download APIs |

## ⚡ Install From Source

```bash
git clone https://github.com/anshdeepofficial/SnapStream.git
cd SnapStream
```

For a Chromium browser, open the Extensions page, enable **Developer mode**, choose **Load unpacked**, and select the extension folder from this repository.

## 🔎 Detection Flow

SnapStream scans supported page image sources, applies the selected filters, removes low-value results, and presents the remaining assets for preview or download.

## ⚖️ Responsible Use

Only download or reuse media when you have permission or the content's license allows it. Website access does not automatically grant reuse rights.

## 🤝 Contributing

Contributions are welcome, particularly around detection reliability, responsive UX, filtering accuracy, browser compatibility, and download handling.

---

<div align="center">
Built by <a href="https://github.com/anshdeepofficial">Anshdeep Singh</a>
</div>
