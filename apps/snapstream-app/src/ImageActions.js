import html from './html.js';
import { downloadImageRobustly } from './robustDownload.js';

export const ImageUrlTextbox = (props) => html`
  <input
    type="text"
    readonly
    onClick=${(e) => {
      e.currentTarget.select();
    }}
    ...${props}
  />
`;

export const OpenImageButton = ({ imageUrl, onClick, ...props }) => {
  return html`
    <button
      type="button"
      title="Open in new tab"
      style=${{ backgroundImage: `url("../images/open.svg")` }}
      onClick=${(e) => {
        chrome.tabs.create({ url: imageUrl, active: false });
        onClick?.(e);
      }}
      ...${props}
    />
  `;
};

export const DownloadImageButton = ({ imageUrl, onClick, ...props }) => {
  return html`
    <button
      type="button"
      title="Download"
      style=${{ backgroundImage: `url("../images/download.svg")` }}
      onClick=${async (e) => {
        const result = await downloadImageRobustly(imageUrl);
        if (!result.success) {
          console.error('[SnapStream] Failed to download image:', result.error);
          // Optionally show a notification to the user
          chrome.notifications?.create({
            type: 'basic',
            iconUrl: '../images/icon_128.png',
            title: 'SnapStream Download Failed',
            message: `Failed to download image: ${result.error}`,
          });
        }
        onClick?.(e);
      }}
      ...${props}
    />
  `;
};
