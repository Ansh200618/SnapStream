import html from './html.js';
import { ExternalLink } from './components/ExternalLink.js';

export const SupportList = () => html`
  <h3>How to Use SnapStream</h3>
  
  <p>
    SnapStream is a powerful image downloader that helps you easily discover, 
    filter, and download images from any website.
  </p>

  <h4>Getting Started</h4>
  <ol>
    <li>Click the SnapStream icon in your browser toolbar while on any webpage</li>
    <li>The extension will automatically scan and display all images on the page</li>
    <li>Use the filters to find specific images you want to download</li>
    <li>Select images by clicking on them</li>
    <li>Click the "Download" button to save selected images</li>
  </ol>

  <h4>Filtering Images</h4>
  <ul>
    <li><b>Filter by URL:</b> Search for images by parts of their URL</li>
    <li><b>Filter Modes:</b> Choose between normal text search, wildcard patterns, or regex</li>
    <li><b>Advanced Filters:</b> Filter by image dimensions (width/height)</li>
    <li><b>Only Images from Links:</b> Show only images that are linked on the page</li>
  </ul>

  <h4>Download Options</h4>
  <ul>
    <li><b>Save to Subfolder:</b> Organize downloads by specifying a subfolder name</li>
    <li><b>Rename Files:</b> Batch rename downloaded images (enable in options)</li>
    <li><b>Download Confirmation:</b> Get a confirmation prompt before downloading</li>
  </ul>

  <h4>Image Display Settings</h4>
  <ul>
    <li><b>Columns:</b> Adjust the number of columns in the image grid (1-10)</li>
    <li><b>Display Width:</b> Set minimum and maximum display width for images</li>
    <li><b>Show URL on Hover:</b> Display the image URL when hovering over images</li>
    <li><b>Quick Actions:</b> Enable Open and Download buttons for individual images</li>
  </ul>

  <p>
    The source code can be found on GitHub:${' '}
    <${ExternalLink}
      href="https://github.com/PactInteractive/image-downloader"
    />
  </p>
`;
