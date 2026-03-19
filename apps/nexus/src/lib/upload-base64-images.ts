import type { ReviewQuestion, ImageState } from './bulk-upload-schema';

/**
 * Convert a base64 data URL to a File object.
 */
function base64ToFile(dataUrl: string, filename: string): File {
  const [header, data] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const ext = mime.split('/')[1] || 'png';

  // Clean whitespace/newlines that AI tools sometimes include in base64
  const cleaned = data.replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new File([bytes], `${filename}.${ext}`, { type: mime });
}

/**
 * Check if an ImageState contains a base64 data URL that hasn't been uploaded yet.
 */
function isBase64Image(image?: ImageState): boolean {
  return !!image && !image.uploaded && image.url.startsWith('data:');
}

interface UploadProgress {
  total: number;
  completed: number;
  failed: number;
}

/**
 * Upload a single base64 image to Supabase storage via the upload API.
 * Returns the updated ImageState with the real URL, or undefined on failure.
 */
async function uploadSingleImage(
  image: ImageState,
  filename: string,
  token: string,
): Promise<ImageState | undefined> {
  try {
    const file = base64ToFile(image.url, filename);
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/question-bank/upload-image', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!res.ok) return undefined;

    const json = await res.json();
    return { url: json.url, uploaded: true, storagePath: json.path };
  } catch {
    return undefined;
  }
}

/**
 * Auto-upload all base64 images in a list of ReviewQuestions.
 * Uploads question images and option images in parallel batches.
 * Returns the updated questions with real Supabase URLs.
 */
export async function uploadBase64Images(
  questions: ReviewQuestion[],
  getToken: () => Promise<string | null>,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ReviewQuestion[]> {
  const token = await getToken();
  if (!token) throw new Error('Authentication failed');

  // Collect all base64 images that need uploading
  interface UploadTask {
    questionIdx: number;
    field: 'question_image' | 'option_image';
    optionIdx?: number;
    image: ImageState;
    filename: string;
  }

  const tasks: UploadTask[] = [];

  questions.forEach((q, qi) => {
    if (isBase64Image(q.question_image)) {
      tasks.push({
        questionIdx: qi,
        field: 'question_image',
        image: q.question_image!,
        filename: `q${q.question_number}_img`,
      });
    }
    q.options.forEach((opt, oi) => {
      if (isBase64Image(opt.image)) {
        tasks.push({
          questionIdx: qi,
          field: 'option_image',
          optionIdx: oi,
          image: opt.image!,
          filename: `q${q.question_number}_opt${oi}`,
        });
      }
    });
  });

  if (tasks.length === 0) return questions;

  const progress: UploadProgress = { total: tasks.length, completed: 0, failed: 0 };
  onProgress?.(progress);

  // Clone questions for mutation
  const updated = questions.map((q) => ({
    ...q,
    question_image: q.question_image ? { ...q.question_image } : undefined,
    options: q.options.map((opt) => ({
      ...opt,
      image: opt.image ? { ...opt.image } : undefined,
    })),
  }));

  // Upload in parallel batches of 3 to avoid overwhelming the server
  const BATCH_SIZE = 3;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((task) => uploadSingleImage(task.image, task.filename, token)),
    );

    results.forEach((result, batchIdx) => {
      const task = batch[batchIdx];
      if (result) {
        if (task.field === 'question_image') {
          updated[task.questionIdx].question_image = result;
        } else if (task.optionIdx !== undefined) {
          updated[task.questionIdx].options[task.optionIdx].image = result;
        }
        progress.completed++;
      } else {
        progress.failed++;
      }
      onProgress?.({ ...progress });
    });
  }

  return updated;
}
