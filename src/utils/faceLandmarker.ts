import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export interface FaceAlignment {
  detected: boolean;
  centred: boolean;
  level: boolean;
  score: number;
  landmarkCount: number;
}

export interface MeshPoint {
  x: number;
  y: number;
}

export interface FaceMeshData {
  points: MeshPoint[];
  edges: [number, number][];
}

let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
    })();
  }

  return faceLandmarkerPromise;
}

/**
 * Uses MediaPipe's 468-point Face Mesh to verify that one face is present,
 * centred in frame, and roughly level before a cosmetic skin analysis begins.
 */
export async function getFaceAlignment(
  video: HTMLVideoElement,
  timestamp: number
): Promise<FaceAlignment> {
  const faceLandmarker = await getFaceLandmarker();
  const result = faceLandmarker.detectForVideo(video, timestamp);
  const landmarks = result.faceLandmarks[0];

  if (!landmarks?.length) {
    return { detected: false, centred: false, level: false, score: 0, landmarkCount: 0 };
  }

  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;

  // Outer eye corners provide a stable, visible check for head roll.
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const eyeTilt = Math.abs(leftEye.y - rightEye.y);
  const centreOffset = Math.hypot(centreX - 0.5, centreY - 0.5);
  const centred = centreOffset <= 0.12 && width >= 0.28 && width <= 0.82 && height >= 0.32;
  const level = eyeTilt <= 0.045;
  const centreScore = Math.max(0, 1 - centreOffset / 0.24);
  const sizeScore = Math.max(0, 1 - Math.abs(width - 0.5) / 0.45);
  const levelScore = Math.max(0, 1 - eyeTilt / 0.09);

  return {
    detected: true,
    centred,
    level,
    score: Math.round((centreScore * 0.5 + sizeScore * 0.25 + levelScore * 0.25) * 100),
    landmarkCount: landmarks.length,
  };
}

/**
 * Returns the real MediaPipe face-mesh landmark points plus a curated set of
 * edges (face oval, brows, eyes, lips) so the HUD wireframe tracks the actual
 * face in the frame rather than a static template. Empty when no face is found.
 */
export async function getFaceMesh(
  video: HTMLVideoElement,
  timestamp: number
): Promise<FaceMeshData> {
  const faceLandmarker = await getFaceLandmarker();
  const result = faceLandmarker.detectForVideo(video, timestamp);
  const landmarks = result.faceLandmarks[0];

  if (!landmarks?.length) {
    return { points: [], edges: [] };
  }

  const points: MeshPoint[] = landmarks.map((point) => ({ x: point.x, y: point.y }));
  const connections = [
    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL ?? [],
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW ?? [],
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW ?? [],
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE ?? [],
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE ?? [],
    FaceLandmarker.FACE_LANDMARKS_LIPS ?? [],
  ];
  const edges: [number, number][] = connections
    .flat()
    .map((connection) => [connection.start, connection.end] as [number, number]);

  return { points, edges };
}
