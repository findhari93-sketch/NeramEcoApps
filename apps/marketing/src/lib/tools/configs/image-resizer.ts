import { ToolConfig } from '../types';
import ImageResizerTeaser from '@/components/tools/teasers/ImageResizerTeaser';

export const imageResizerConfig: ToolConfig = {
  slug: 'image-resizer',
  title: 'NATA Image Resizer 2026',
  subtitle:
    'Resize, crop, and compress your photograph and signature to the exact specifications required by the NATA 2026 application portal. The tool produces a 200 x 230 pixel JPEG photograph (10 to 200 KB) and a 150 x 60 pixel JPEG signature (4 to 30 KB), the formats accepted by the Council of Architecture. Everything runs in your browser. Files never leave your device, so personal photos stay private. No signup, no watermark, no fee. Most students fix a rejected upload in under two minutes, including the time to take a fresh photo on a phone.',
  category: 'nata',
  appUrl: 'https://app.neramclasses.com/tools/nata/image-crop',
  metaTitle: 'NATA Image Resizer 2026: Photo and Signature Crop Tool (Free)',
  metaDescription:
    'Free NATA photo and signature resizer for 2026 applications. Crop to 200x230 px JPEG (10 to 200 KB) and 150x60 px signature (4 to 30 KB). Browser-based, no upload.',
  keywords: [
    'NATA image resizer',
    'NATA photo resizer 2026',
    'NATA signature resizer',
    'NATA application photo size',
    'NATA photo dimensions',
    'NATA application form image upload',
    'NATA photo upload error',
    'B.Arch application photo size',
  ],
  ogImageTitle: 'NATA Image Resizer',
  ogImageSubtitle: 'Photo and signature, exact specs',
  trustBadges: ['Free Forever', 'No Upload', 'Runs Offline', 'NATA 2026 Specs'],
  steps: [
    {
      title: 'Open the Resizer in your Browser',
      desc: 'Click the button below to launch the tool. It loads instantly on phones and laptops, and works on slow networks because everything runs locally.',
    },
    {
      title: 'Upload your Photo or Signature',
      desc: 'Drag a file or tap to select. Supported inputs include JPEG, PNG, HEIC (iPhone), and WebP. Choose the photograph or signature mode based on what you are preparing.',
    },
    {
      title: 'Crop and Adjust',
      desc: 'Drag the crop box to keep your face centered and shoulders visible. The tool locks the aspect ratio to NATA specs (200x230 for photo, 150x60 for signature), so the output is always compliant.',
    },
    {
      title: 'Download the Compliant File',
      desc: 'The resizer outputs a JPEG with the exact dimensions and file size NATA accepts. Download and upload directly to your NATA application without any further edit.',
    },
  ],
  features: [
    {
      title: 'Exact NATA 2026 Specifications',
      desc: 'Photograph: 200 x 230 pixels, JPEG, 10 to 200 KB. Signature: 150 x 60 pixels, JPEG, 4 to 30 KB. The tool enforces these limits so the upload never gets rejected.',
    },
    {
      title: 'Privacy First, No Server Upload',
      desc: 'Image processing happens in your browser using HTML5 Canvas. Photos and signatures never leave your device. No analytics tracks the file content.',
    },
    {
      title: 'Phone, Tablet, Laptop Friendly',
      desc: 'Touch-optimised crop handles on mobile (48 px minimum tap targets). Pinch to zoom on tablets. Works offline once the page loads, useful in low-connectivity centres.',
    },
    {
      title: 'Smart Compression',
      desc: 'The compressor adjusts JPEG quality automatically to fit the file size window without making your face look blurry. If the photo is already small, it skips compression to preserve quality.',
    },
    {
      title: 'Background Whitener (Optional)',
      desc: 'A one-tap helper lightens the background to a near-white tone for photos taken against a plain wall, which is what the NATA portal recommends.',
    },
    {
      title: 'Reject Reason Helper',
      desc: 'If your upload was rejected, paste the error message and the tool suggests what to fix: file too large, dimensions off, format wrong, or background too dark.',
    },
  ],
  screenshots: {
    desktop: '/placeholder-desktop.png',
    mobile: '/placeholder-mobile.png',
    caption: 'NATA Image Resizer cropping a photograph to 200 x 230 pixels',
    alt: 'NATA Image Resizer tool showing photograph crop interface',
  },
  contextHeading: 'Why NATA Photo and Signature Specs are Strict',
  contextContent: `<p>The NATA 2026 application portal accepts only photographs and signatures that match exact specifications: 200 x 230 pixels in JPEG format for the photograph (10 to 200 KB), and 150 x 60 pixels JPEG for the signature (4 to 30 KB). These rules exist because the Council of Architecture prints physical admit cards and identity verification documents, where consistent image dimensions matter. A photo that is too large or too small distorts the print, and a signature that exceeds the height makes verification harder during the exam.</p><p>Most rejected uploads fail for one of three reasons. First, the photo was taken on a phone and the file is several megabytes, far above the 200 KB cap. Second, the photo is the wrong shape, often tall portrait when it should be 200 x 230. Third, the signature was scanned at low resolution and the file came back too small or in PNG format. Our resizer fixes all three in a single workflow: it crops to the right shape, compresses to the right size, and outputs the right format every time.</p><p>The tool is part of the broader Neram aiArchitek toolkit, alongside the cutoff calculator, college predictor, and exam centre locator. All tools are free for the general public and require no signup, so a candidate can prepare every part of an application at one place.</p>`,
  faqs: [
    {
      question: 'What are the exact NATA 2026 photo and signature dimensions?',
      answer:
        'NATA 2026 accepts a photograph of 200 x 230 pixels in JPEG format, between 10 KB and 200 KB. The signature must be 150 x 60 pixels in JPEG format, between 4 KB and 30 KB. The Image Resizer enforces these specs so the upload is always compliant.',
    },
    {
      question: 'Why does the NATA portal reject my photo upload?',
      answer:
        'The most common rejection reasons are: file size too large (above 200 KB), wrong dimensions (not 200 x 230 pixels), wrong format (PNG or HEIC instead of JPEG), and background too dark or busy. The resizer corrects all four in one step.',
    },
    {
      question: 'Is the Image Resizer free?',
      answer:
        'Yes, the NATA Image Resizer is fully free with no signup, no watermark, no file count limit, and no daily cap. It is a service Neram Classes provides to every NATA aspirant.',
    },
    {
      question: 'Are my photos uploaded to a server?',
      answer:
        'No. Image processing happens entirely in your browser using HTML5 Canvas. Photos and signatures never leave your device. We do not see, store, or analyse any image you process.',
    },
    {
      question: 'What input formats are supported?',
      answer:
        'You can upload JPEG, PNG, HEIC (the default iPhone format), WebP, and BMP. The output is always JPEG, which is what the NATA portal requires.',
    },
    {
      question: 'Can I take the photo on a phone and resize it directly?',
      answer:
        'Yes, this is the recommended workflow. Take a clear face photo against a plain white wall in daylight, open the resizer on your phone, upload the photo, crop, and download the compliant file. Most candidates finish in under two minutes.',
    },
    {
      question: 'My signature scan came out too small. Can the tool upscale it?',
      answer:
        'Yes, the tool can upscale a small signature to 150 x 60 pixels using bicubic interpolation, which keeps strokes smooth. For best results, sign on plain white paper with a black or blue pen and scan at 300 DPI.',
    },
    {
      question: 'Does this tool work for JEE Paper 2 or JoSAA applications?',
      answer:
        'JEE Paper 2 (administered by NTA) accepts a 3.5 x 4.5 cm photo and signature with similar but not identical specs. The resizer offers a JEE preset toggle that adjusts dimensions accordingly. JoSAA reuses the JEE photo, so the same output works.',
    },
  ],
  relatedToolSlugs: ['college-predictor', 'eligibility-checker', 'exam-centers'],
  teaserComponent: ImageResizerTeaser,
};
