'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import VRMViewer from '@/components/VRMViewer';
import faceParamsConfig from '@/config/face-params.json';

interface FaceFeatures {
  eyeWidth: number;
  eyeHeight: number;
  eyeAspectRatio: number;
  eyeSlantAngle: number; // 目の傾斜角度（正:つり目、負:たれ目）
  browHeight: number; // 眉の高さ（目からの距離）
  browAngle: number; // 眉の角度（正:上がり眉、負:下がり眉）
  noseWidth: number;
  noseHeight: number;
  noseProjection: number; // 鼻の3D突出度（z座標を活用）
  cheekFullness: number; // 頬骨の突出度（頬骨の立体感）
  mouthWidth: number;
  mouthHeight: number;
  lipThickness: number; // 唇の厚み（上唇と下唇の平均厚み）
  faceAspectRatio: number;
  jawSharpness: number; // 顎の尖り具合（高い値ほどシャープ）
  interocularDistance: number;
  processingTime: number;
}

interface VRMAdjustments {
  eyeWide: number;
  eyeNarrow: number;
  noseWide: number;
  noseNarrow: number;
  mouthWide: number;
  mouthNarrow: number;
  faceWide: number;
  faceNarrow: number;
}

// 新しいUI表示用の特徴量インターface
interface UIFriendlyFeatures {
  // 目の調整
  eyeSize: number;        // 目の大きさ (eyeWidth × eyeHeight)
  eyeShape: number;       // 目の縦横比 (eyeSlantAngle)
  eyeDistance: number;    // 両目の間隔 (interocularDistance)
  
  // 鼻の調整
  noseWidth: number;      // 鼻の幅
  noseHeight: number;     // 鼻の高さ
  
  // 口の調整
  mouthWidth: number;     // 口の幅
  lipThickness: number;   // 唇の厚さ
  
  // 顔の輪郭
  faceShape: number;      // 顔の幅 (faceAspectRatio)
  jawShape: number;       // 顎の形 (jawSharpness)
}

// 仕様書準拠: パラメータ正規化関数
const normalizeParam = (value: number, paramName: string): number => {
  const config = faceParamsConfig[paramName as keyof typeof faceParamsConfig];
  if (!config) return Math.max(0, Math.min(1, value));
  
  // gain * value + offset の式で 0-1 に変換
  const normalized = config.gain * value + config.offset;
  return Math.max(config.clip[0], Math.min(config.clip[1], normalized));
};

type DetectionMode = 'camera' | 'photo';

export default function FaceLandmarkTester() {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Core State
  const [faceLandmarkerVideo, setFaceLandmarkerVideo] = useState<FaceLandmarker | null>(null);
  const [faceLandmarkerImage, setFaceLandmarkerImage] = useState<FaceLandmarker | null>(null);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('photo');
  const [status, setStatus] = useState('🚀 AIモデルを初期化中...');
  const [initProgress, setInitProgress] = useState(0);
  
  // VRM表示制御（将来の使用に備えて保持）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showVRM, setShowVRM] = useState(false);
  
  // Camera State（将来の使用に備えて保持）
  const [isRunning, setIsRunning] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [cameraFeatures, setCameraFeatures] = useState<FaceFeatures | null>(null);
  
  // Photo State
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [photoFeatures, setPhotoFeatures] = useState<FaceFeatures | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStep, setAnalysisStep] = useState('');
  const [isWarmedUp, setIsWarmedUp] = useState(false);

  // MediaPipe初期化
  useEffect(() => {
    const initializeMediaPipe = async () => {
      try {
        setStatus('📦 MediaPipe Vision Tasks を読み込み中...');
        setInitProgress(20);
        
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        
        setStatus('🧠 Face Landmarker AIモデルをダウンロード中...');
        setInitProgress(40);
        
        // VIDEO用のFaceLandmarker作成
        const landmarkerVideo = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        
        setFaceLandmarkerVideo(landmarkerVideo);
        setInitProgress(70);
        setStatus('📷 IMAGE用モデルを初期化中...');
        
        // IMAGE用のFaceLandmarker作成
        const landmarkerImage = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "IMAGE",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        
        setFaceLandmarkerImage(landmarkerImage);
        setInitProgress(90);
        setStatus('🔧 MediaPipe最適化中...');
        
        // MediaPipeの内部ログを抑制（WASM/Emscripten出力を含む）
        const originalConsoleLog = console.log;
        const originalConsoleInfo = console.info;
        const originalConsoleWarn = console.warn;
        const originalConsoleError = console.error;
        
        // MediaPipeの内部ログをフィルタリング
        const filterMediaPipeLog = (args: unknown[]) => {
          if (args[0] && typeof args[0] === 'string') {
            const msg = args[0];
            return msg.includes('Created TensorFlow Lite XNNPACK delegate') ||
                   msg.includes('INFO:') ||
                   msg.includes('Graph successfully started') ||
                   msg.includes('Graph finished closing') ||
                   msg.includes('GL version:') ||
                   msg.includes('OpenGL error checking');
          }
          return false;
        };
        
        console.log = (...args) => {
          if (filterMediaPipeLog(args)) return;
          originalConsoleLog.apply(console, args);
        };
        console.info = (...args) => {
          if (filterMediaPipeLog(args)) return;
          originalConsoleInfo.apply(console, args);
        };
        console.warn = (...args) => {
          if (filterMediaPipeLog(args)) return;
          originalConsoleWarn.apply(console, args);
        };
        console.error = (...args) => {
          if (filterMediaPipeLog(args)) return;
          originalConsoleError.apply(console, args);
        };
        
        setIsWarmedUp(true);
        
        setInitProgress(100);
        setStatus('✅ 準備完了！カメラまたは写真でテストしてください');
        
      } catch (error) {
        console.error('MediaPipe初期化エラー:', error);
        setStatus('❌ 初期化に失敗しました。ページを再読み込みしてください。');
      }
    };

    initializeMediaPipe();
  }, []);


  // カメラ機能
  const toggleCamera = useCallback(async () => {
    if (!faceLandmarkerVideo) return;

    if (isRunning) {
      setIsRunning(false);
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
      setStatus('📹 カメラを停止しました');
      setCameraFeatures(null);
      return;
    }

    try {
      setDetectionMode('camera');
      setUploadedImage(null);
      setPhotoFeatures(null);
      setStatus('📹 カメラ起動中...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          facingMode: 'user'
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          setIsRunning(true);
          setStatus('🎯 リアルタイム顔検出実行中...');
          detectFaceFromVideo();
        };
      }
      
    } catch (error) {
      console.error('カメラアクセスエラー:', error);
      setStatus('❌ カメラアクセスが拒否されました。HTTPSまたはlocalhostでお試しください。');
    }
  }, [faceLandmarkerVideo, isRunning]);

  // リアルタイム顔検出
  const detectFaceFromVideo = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !faceLandmarkerVideo || !isRunning) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const startTime = performance.now();
    
    try {
      // VIDEO用のFaceLandmarkerを直接使用
      const results = faceLandmarkerVideo.detectForVideo(video, startTime);
      const processingTime = performance.now() - startTime;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        drawLandmarks(ctx, landmarks, canvas.width, canvas.height);
        const calculatedFeatures = calculateDetailedFeatures(landmarks, processingTime);
        setCameraFeatures(calculatedFeatures);
      } else {
        setCameraFeatures(null);
      }
    } catch (error) {
      console.error('顔検出エラー:', error);
    }

    if (isRunning) {
      requestAnimationFrame(() => detectFaceFromVideo());
    }
  }, [faceLandmarkerVideo, isRunning]);

  // 写真アップロード処理
  const handlePhotoUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !faceLandmarkerImage) return;

    console.log('🔍 画像アップロード開始:', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      lastModified: new Date(file.lastModified).toLocaleString()
    });

    // HEIC形式の検出とエラーメッセージ
    if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
      console.warn('❌ HEIC/HEIF形式はサポートされていません');
      alert('申し訳ございませんが、HEIC/HEIF形式はサポートされていません。JPG、PNG、GIF形式の画像をご利用ください。');
      return;
    }

    if (!file.type.startsWith('image/')) {
      console.warn('❌ 画像ファイルではありません:', file.type);
      alert('画像ファイル（JPG, PNG, GIF等）を選択してください');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      console.warn('❌ ファイルサイズが大きすぎます:', file.size);
      alert('ファイルサイズが大きすぎます（10MB以下にしてください）');
      return;
    }

    if (isRunning) {
      console.log('📹 カメラを停止してから写真モードに切り替え');
      toggleCamera();
    }

    setDetectionMode('photo');
    setPhotoFeatures(null);
    setStatus('📷 写真をアップロード中...');

    console.log('📁 FileReader読み込み開始');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const imageSrc = e.target?.result as string;
      console.log('✅ FileReader完了:', {
        fileType: file.type,
        fileSize: file.size,
        resultType: typeof imageSrc,
        resultLength: imageSrc?.length,
        resultPrefix: imageSrc?.substring(0, 50)
      });
      setUploadedImage(imageSrc);
      setStatus('✅ 写真をアップロードしました。解析を開始するには下のボタンを押してください。');

      console.log('🖼️ 画像要素の読み込み開始');
      const img = new Image();
      img.onload = async () => {
        console.log('✅ 画像読み込み完了:', {
          width: img.width,
          height: img.height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        });
      };
      img.onerror = (error) => {
        console.error('❌ 画像読み込み失敗:', error);
        console.error('imageSrc details:', {
          length: imageSrc?.length,
          preview: imageSrc?.substring(0, 100)
        });
        setStatus('❌ 画像の読み込みに失敗しました');
      };
      img.src = imageSrc;
    };
    reader.onerror = (error) => {
      console.error('❌ ファイル読み込み失敗:', error);
      setStatus('❌ ファイルの読み込みに失敗しました');
    };
    reader.readAsDataURL(file);
  }, [faceLandmarkerImage, isRunning, toggleCamera]);

  // 解析開始処理
  const startAnalysis = useCallback(async () => {
    if (!uploadedImage || !faceLandmarkerImage) {
      console.error('❌ 解析開始失敗: 画像またはfaceLandmarkerImageがありません', {
        hasImage: !!uploadedImage,
        hasFaceLandmarkerImage: !!faceLandmarkerImage
      });
      return;
    }
    
    console.log('🚀 AI解析開始');
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisStep('画像準備中...');
    setStatus('🔍 AI解析実行中...');
    
    const img = new Image();
    img.onload = async () => {
      console.log('📸 解析用画像読み込み完了, MediaPipe処理開始');
      setAnalysisProgress(20);
      setAnalysisStep('MediaPipe処理開始...');
      await analyzePhoto(img);
    };
    img.onerror = (error) => {
      console.error('❌ 解析用画像読み込み失敗:', error);
      setStatus('❌ 画像の読み込みに失敗しました');
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      setAnalysisStep('');
    };
    img.src = uploadedImage;
  }, [uploadedImage, faceLandmarkerImage]);

  // 写真解析処理
  const analyzePhoto = useCallback(async (imageElement: HTMLImageElement) => {
    console.log('🔍 analyzePhoto関数開始', {
      hasFaceLandmarkerImage: !!faceLandmarkerImage,
      hasCanvas: !!photoCanvasRef.current,
      faceLandmarkerType: typeof faceLandmarkerImage,
      canvasRefType: typeof photoCanvasRef.current
    });

    if (!faceLandmarkerImage) {
      console.error('❌ faceLandmarkerImageがありません');
      setStatus('❌ AI解析モデル（IMAGE）が初期化されていません');
      setIsAnalyzing(false);
      return;
    }

    if (!photoCanvasRef.current) {
      console.error('❌ photoCanvasがありません');
      setStatus('❌ Canvas要素が見つかりません');
      setIsAnalyzing(false);
      return;
    }

    const canvas = photoCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('❌ Canvas 2Dコンテキストの取得に失敗');
      return;
    }

    try {
      console.log('🖼️ 画像処理開始:', {
        originalWidth: imageElement.width,
        originalHeight: imageElement.height,
        naturalWidth: imageElement.naturalWidth,
        naturalHeight: imageElement.naturalHeight
      });

      setAnalysisProgress(30);
      setAnalysisStep('画像サイズ調整中...');

      const maxWidth = 1024;
      const maxHeight = 1024;
      let { width, height } = imageElement;
      
      if (width > maxWidth || height > maxHeight) {
        const scale = Math.min(maxWidth / width, maxHeight / height);
        width *= scale;
        height *= scale;
        console.log('📏 画像サイズ調整:', {
          originalSize: `${imageElement.width}x${imageElement.height}`,
          scale: scale,
          newSize: `${width}x${height}`
        });
      }

      setAnalysisProgress(40);
      setAnalysisStep('Canvas準備中...');

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(imageElement, 0, 0, width, height);
      console.log('✅ Canvasに画像描画完了');

      setAnalysisProgress(50);
      setAnalysisStep('MediaPipe AI解析実行中...');
      setStatus('🔍 MediaPipe AI解析実行中...');
      console.log('🧠 MediaPipe顔検出処理開始');
      const startTime = performance.now();
      
      // IMAGE用のFaceLandmarkerを直接使用（モード切り替え不要）
      console.log('🔍 IMAGE用FaceLandmarkerで顔検出実行中...', {
        isWarmedUp,
        expectedFastProcessing: isWarmedUp
      });
      
      const results = faceLandmarkerImage.detect(imageElement);
      const processingTime = performance.now() - startTime;
      console.log('✅ MediaPipe顔検出完了', {
        processingTime: `${processingTime.toFixed(2)}ms`,
        wasWarmedUp: isWarmedUp
      });
      
      console.log('📊 MediaPipe解析完了:', {
        processingTime: `${processingTime.toFixed(2)}ms`,
        facesDetected: results.faceLandmarks?.length || 0,
        hasResults: !!(results.faceLandmarks && results.faceLandmarks.length > 0)
      });

      setAnalysisProgress(70);
      setAnalysisStep('顔検出結果処理中...');

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        console.log('✅ 顔検出成功:', {
          landmarkCount: landmarks.length,
          firstLandmark: landmarks[0],
          lastLandmark: landmarks[landmarks.length - 1]
        });
        
        setAnalysisProgress(80);
        setAnalysisStep('ランドマーク描画中...');
        console.log('🎨 ランドマーク描画開始');
        drawLandmarks(ctx, landmarks, width, height);
        
        setAnalysisProgress(90);
        setAnalysisStep('特徴量計算中...');
        console.log('📐 特徴量計算開始');
        const calculatedFeatures = calculateDetailedFeatures(landmarks, processingTime);
        console.log('✅ 特徴量計算完了:', calculatedFeatures);
        
        setAnalysisProgress(100);
        setAnalysisStep('解析完了');
        setPhotoFeatures(calculatedFeatures);
        setStatus(`✅ 顔検出成功！${landmarks.length}個のランドマーク点を検出`);
      } else {
        console.warn('❌ 顔が検出されませんでした');
        setAnalysisProgress(100);
        setAnalysisStep('顔検出失敗');
        setPhotoFeatures(null);
        setStatus('❌ 顔が検出されませんでした。明るく正面を向いた写真をお試しください。');
      }
      
    } catch (error) {
      console.error('❌ 写真解析エラー:', error);
      console.error('エラー詳細:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      setStatus('❌ 写真の解析に失敗しました');
      setAnalysisProgress(0);
      setAnalysisStep('エラー発生');
    } finally {
      console.log('🏁 解析処理完了');
      setIsAnalyzing(false);
      setTimeout(() => {
        setAnalysisProgress(0);
        setAnalysisStep('');
      }, 2000);
    }
  }, [faceLandmarkerImage, isWarmedUp]);

  // 詳細特徴量計算（仕様書準拠）
  const calculateDetailedFeatures = (landmarks: Array<{x: number, y: number, z?: number}>, processingTime: number): FaceFeatures => {
    try {
      // 仕様書準拠: 顔のベース寸法を最初に計算
      const faceTop = landmarks[10];       // 顔上端
      const faceBottom = landmarks[152];   // 顔下端（顎先）
      const faceLeft = landmarks[234];     // 顔左端
      const faceRight = landmarks[454];    // 顔右端
      
      const faceWidth = Math.abs(faceRight.x - faceLeft.x);
      const faceHeight = Math.abs(faceBottom.y - faceTop.y);
      const faceAspectRatio = faceHeight / faceWidth; // 仕様書のfaceRatio相当

      // 目の特徴（左目基準）
      const leftEyeOuter = landmarks[33];
      const leftEyeInner = landmarks[133];
      const leftEyeTop = landmarks[159];
      const leftEyeBottom = landmarks[145];

      // 仕様書準拠: 目の特徴を正規化して計算
      const eyeWidth = Math.hypot(
        leftEyeOuter.x - leftEyeInner.x,
        leftEyeOuter.y - leftEyeInner.y
      ) / faceWidth; // 正規化

      const eyeHeight = Math.hypot(
        leftEyeTop.x - leftEyeBottom.x,
        leftEyeTop.y - leftEyeBottom.y
      ) / faceHeight; // 正規化

      const eyeAspectRatio = eyeHeight / eyeWidth;

      // 仕様書準拠: 目の傾斜角度計算（eyeTilt）
      // 推定レンジ: -15°～+15°
      const rightEyeInner = landmarks[362];
      const eyeSlantAngle = Math.atan2(
        rightEyeInner.y - leftEyeInner.y,
        rightEyeInner.x - leftEyeInner.x
      ) * (180 / Math.PI);

      // 両目の間隔（正規化）
      const interocularDistance = Math.hypot(
        leftEyeInner.x - rightEyeInner.x,
        leftEyeInner.y - rightEyeInner.y
      ) / faceWidth; // eyeGap相当

      // 仕様書準拠: 眉の特徴計算
      const leftBrowInner = landmarks[70];  // 左眉内側
      const leftBrowMiddle = landmarks[107]; // 左眉中央
      const leftBrowOuter = landmarks[55];  // 左眉外側
      // 将来の使用に備えて保持
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const rightBrowInner = landmarks[300]; // 右眉内側
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const rightBrowOuter = landmarks[285]; // 右眉外側

      // 仕様書準拠: 眉の高さ（browY）- 正規化済み
      const browHeight = Math.abs(leftBrowMiddle.y - leftEyeTop.y) / faceHeight;

      // 仕様書準拠: 眉の角度計算（browTilt）
      // 推定レンジ: -20°～+20°
      const browAngle = Math.atan2(
        leftBrowOuter.y - leftBrowInner.y,
        leftBrowOuter.x - leftBrowInner.x
      ) * (180 / Math.PI);

      // 仕様書準拠: 鼻の特徴計算
      const noseLeft = landmarks[97];  // 仕様書推奨の鼻左点
      const noseRight = landmarks[326]; // 仕様書推奨の鼻右点
      const noseTip = landmarks[1];
      const noseBridge = landmarks[168]; // 仕様書推奨の鼻根点

      // 正規化済み鼻の特徴
      const noseWidth = Math.hypot(
        noseLeft.x - noseRight.x,
        noseLeft.y - noseRight.y
      ) / faceWidth; // 推定レンジ: 0.12-0.25

      const noseHeight = Math.hypot(
        noseBridge.x - noseTip.x,
        noseBridge.y - noseTip.y
      ) / faceHeight; // noseLength相当

      // 仕様書準拠: z座標を活用した3D突出度
      const noseProjection = noseTip.z ? Math.abs(noseTip.z) : 0;

      // 仕様書準拠: 頬骨の突出度計算（正規化）
      const leftCheek = landmarks[234];   // 左頬の最外側
      const rightCheek = landmarks[454];  // 右頬の最外側  
      const faceLeftEdge = landmarks[172]; // 顔の左端（顎角付近）
      const faceRightEdge = landmarks[397]; // 顔の右端（顎角付近）
      
      // 正規化済み頬骨の突出度
      const leftCheekFullness = Math.hypot(
        leftCheek.x - faceLeftEdge.x,
        leftCheek.y - faceLeftEdge.y
      ) / faceWidth;
      const rightCheekFullness = Math.hypot(
        rightCheek.x - faceRightEdge.x,
        rightCheek.y - faceRightEdge.y
      ) / faceWidth;
      const cheekFullness = (leftCheekFullness + rightCheekFullness) / 2;

      // 仕様書準拠: 口の特徴計算
      const mouthLeft = landmarks[61];
      const mouthRight = landmarks[291];
      const mouthTop = landmarks[13];
      const mouthBottom = landmarks[14];

      // 正規化済み口の特徴
      const mouthWidth = Math.hypot(
        mouthLeft.x - mouthRight.x,
        mouthLeft.y - mouthRight.y
      ) / faceWidth; // 推定レンジ: 0.25-0.50

      const mouthHeight = Math.hypot(
        mouthTop.x - mouthBottom.x,
        mouthTop.y - mouthBottom.y
      ) / faceHeight;

      // 仕様書準拠: 唇の厚み計算（正規化）
      const upperLipTop = landmarks[13];    // 上唇の上端
      const upperLipBottom = landmarks[12]; // 上唇の下端（唇の境界線）
      const lowerLipTop = landmarks[15];    // 下唇の上端（唇の境界線）
      const lowerLipBottom = landmarks[17]; // 下唇の下端
      
      // 正規化済み唇の厚み
      const upperLipThickness = Math.hypot(
        upperLipTop.x - upperLipBottom.x,
        upperLipTop.y - upperLipBottom.y
      ) / faceHeight;
      
      const lowerLipThickness = Math.hypot(
        lowerLipTop.x - lowerLipBottom.x,
        lowerLipTop.y - lowerLipBottom.y
      ) / faceHeight;
      
      // 推定レンジ: 0.01-0.04
      const lipThickness = (upperLipThickness + lowerLipThickness) / 2;

      // 仕様書準拠: 顎の角度計算（jawAngle）
      // 推定レンジ: 60-120°
      const chinTip = landmarks[152]; // 顎先（仕様書準拠）
      const leftJaw = landmarks[234];  // 左顎角
      const rightJaw = landmarks[454]; // 右顎角
      
      // 顎の角度を計算（∠(LM234-LM152-LM454)）
      const leftJawVector = {
        x: leftJaw.x - chinTip.x,
        y: leftJaw.y - chinTip.y
      };
      const rightJawVector = {
        x: rightJaw.x - chinTip.x,
        y: rightJaw.y - chinTip.y
      };
      
      // 両ベクトルの内積から角度を計算
      const dotProduct = leftJawVector.x * rightJawVector.x + leftJawVector.y * rightJawVector.y;
      const leftMagnitude = Math.hypot(leftJawVector.x, leftJawVector.y);
      const rightMagnitude = Math.hypot(rightJawVector.x, rightJawVector.y);
      const jawAngle = Math.acos(dotProduct / (leftMagnitude * rightMagnitude)) * (180 / Math.PI);
      
      // 仕様書準拠: 角度をSharp/Round判定に変換
      const jawSharpness = jawAngle < 90 ? (90 - jawAngle) / 30 : 0; // 0-1値

      return {
        eyeWidth: Number(eyeWidth.toFixed(4)),
        eyeHeight: Number(eyeHeight.toFixed(4)),
        eyeAspectRatio: Number(eyeAspectRatio.toFixed(4)),
        eyeSlantAngle: Number(eyeSlantAngle.toFixed(2)),
        browHeight: Number(browHeight.toFixed(4)),
        browAngle: Number(browAngle.toFixed(2)),
        noseWidth: Number(noseWidth.toFixed(4)),
        noseHeight: Number(noseHeight.toFixed(4)),
        noseProjection: Number(noseProjection.toFixed(4)),
        cheekFullness: Number(cheekFullness.toFixed(4)),
        mouthWidth: Number(mouthWidth.toFixed(4)),
        mouthHeight: Number(mouthHeight.toFixed(4)),
        lipThickness: Number(lipThickness.toFixed(4)),
        faceAspectRatio: Number(faceAspectRatio.toFixed(4)),
        jawSharpness: Number(jawSharpness.toFixed(3)),
        interocularDistance: Number(interocularDistance.toFixed(4)),
        processingTime: Number(processingTime.toFixed(2))
      };
    } catch (error) {
      console.error('特徴量計算エラー:', error);
      return {
        eyeWidth: 0, eyeHeight: 0, eyeAspectRatio: 0, eyeSlantAngle: 0, browHeight: 0, browAngle: 0,
        noseWidth: 0, noseHeight: 0, noseProjection: 0, cheekFullness: 0, mouthWidth: 0, mouthHeight: 0, lipThickness: 0,
        faceAspectRatio: 0, jawSharpness: 0, interocularDistance: 0,
        processingTime: Number(processingTime.toFixed(2))
      };
    }
  };

  // VRM調整予測計算
  const predictVRMAdjustments = (features: FaceFeatures): VRMAdjustments => {
    const baseline = {
      eyeAspectRatio: 0.25,
      noseWidth: 0.04,
      mouthWidth: 0.06,
      faceAspectRatio: 1.3
    };

    const adjustments: VRMAdjustments = {
      eyeWide: 0, eyeNarrow: 0, noseWide: 0, noseNarrow: 0,
      mouthWide: 0, mouthNarrow: 0, faceWide: 0, faceNarrow: 0
    };

    try {
      const eyeRatio = features.eyeAspectRatio / baseline.eyeAspectRatio;
      if (eyeRatio > 1.2) {
        adjustments.eyeWide = Math.min((eyeRatio - 1) * 2, 1.0);
      } else if (eyeRatio < 0.8) {
        adjustments.eyeNarrow = Math.min((1 - eyeRatio) * 2, 1.0);
      }

      const noseRatio = features.noseWidth / baseline.noseWidth;
      if (noseRatio > 1.15) {
        adjustments.noseWide = Math.min((noseRatio - 1) * 1.5, 1.0);
      } else if (noseRatio < 0.85) {
        adjustments.noseNarrow = Math.min((1 - noseRatio) * 1.5, 1.0);
      }

      const mouthRatio = features.mouthWidth / baseline.mouthWidth;
      if (mouthRatio > 1.1) {
        adjustments.mouthWide = Math.min((mouthRatio - 1) * 1.5, 1.0);
      } else if (mouthRatio < 0.9) {
        adjustments.mouthNarrow = Math.min((1 - mouthRatio) * 1.5, 1.0);
      }

      const faceRatio = features.faceAspectRatio / baseline.faceAspectRatio;
      if (faceRatio > 1.1) {
        adjustments.faceNarrow = Math.min((faceRatio - 1) * 1.2, 1.0);
      } else if (faceRatio < 0.9) {
        adjustments.faceWide = Math.min((1 - faceRatio) * 1.2, 1.0);
      }
    } catch (error) {
      console.error('VRM調整計算エラー:', error);
    }

    return adjustments;
  };

  // UI表示用の特徴量を計算する関数
  const calculateUIFriendlyFeatures = (features: FaceFeatures): UIFriendlyFeatures => {
    try {
      return {
        // 目の調整
        eyeSize: features.eyeWidth * features.eyeHeight,           // 目の大きさ
        eyeShape: features.eyeSlantAngle,                          // 目の縦横比（つり目/たれ目）
        eyeDistance: features.interocularDistance,                 // 両目の間隔
        
        // 鼻の調整
        noseWidth: features.noseWidth,                             // 鼻の幅
        noseHeight: features.noseHeight,                           // 鼻の高さ
        
        // 口の調整
        mouthWidth: features.mouthWidth,                           // 口の幅
        lipThickness: features.lipThickness,                       // 唇の厚さ
        
        // 顔の輪郭
        faceShape: features.faceAspectRatio,                       // 顔の幅（丸顔/面長）
        jawShape: features.jawSharpness                            // 顎の形（シャープ/丸み）
      };
    } catch (error) {
      console.error('UI表示用特徴量計算エラー:', error);
      return {
        eyeSize: 0, eyeShape: 0, eyeDistance: 0,
        noseWidth: 0, noseHeight: 0,
        mouthWidth: 0, lipThickness: 0,
        faceShape: 0, jawShape: 0
      };
    }
  };

  // 相対的表現を生成する関数
  const getRelativeExpression = (value: number, baseline: number, strongLabel: string, weakLabel: string): string => {
    const ratio = baseline > 0 ? value / baseline : 0;
    if (ratio > 1.15) return `${strongLabel}め`;
    else if (ratio > 1.05) return `やや${strongLabel}`;
    else if (ratio < 0.85) return `${weakLabel}め`;
    else if (ratio < 0.95) return `やや${weakLabel}`;
    else return '標準的';
  };

  // morph値を計算する関数（新しい特徴量用）
  const calculateMorphValue = (value: number, paramConfig: {min: number, max: number}): number => {
    const normalized = (value - paramConfig.min) / (paramConfig.max - paramConfig.min);
    return Math.max(0, Math.min(100, normalized * 100));
  };

  // 複合的な体型判定スコア計算
  const calculateBodyTypeScore = (features: FaceFeatures): number => {
    let score = 0;

    try {
      // 条件1: 顔の縦横比による判定
      if (features.faceAspectRatio < 0.95) {
        // 横に広い丸顔なら「ふくよか」スコア+1
        score++;
      } else if (features.faceAspectRatio > 1.15) {
        // 縦に長い面長なら「痩せ」スコア-1
        score--;
      }

      // 条件2: 顎のラインによる判定
      if (features.jawSharpness < 0.3) {
        // 顎が丸ければ「ふくよか」スコア+1
        score++;
      } else if (features.jawSharpness > 0.6) {
        // 顎がシャープなら「痩せ」スコア-1
        score--;
      }

      // 条件3: 頬骨の突出度（これは痩せ型の特徴として解釈）
      if (features.cheekFullness > 0.4) {
        // 頬骨が出ていれば「痩せ」スコア-1
        score--;
      } else if (features.cheekFullness < 0.2) {
        // 頬骨が控えめなら「ふくよか」スコア+1
        score++;
      }

      // 条件4: 両目の間隔（ふくよかな人は相対的に狭くなる傾向）
      if (features.interocularDistance < 0.28) {
        // 目の間隔が狭めなら「ふくよか」スコア+1
        score++;
      } else if (features.interocularDistance > 0.35) {
        // 目の間隔が広めなら「痩せ」スコア-1
        score--;
      }

    } catch (error) {
      console.error('体型判定スコア計算エラー:', error);
    }

    return score;
  };

  // 客観的日本語顔特徴説明生成
  const generateFaceDescription = (features: FaceFeatures): string[] => {
    const descriptions: string[] = [];
    
    try {
      // 顔の縦横比に基づく顔型判定
      if (features.faceAspectRatio > 1.15) {
        descriptions.push("面長な輪郭");
      } else if (features.faceAspectRatio < 0.95) {
        descriptions.push("横幅のある輪郭");
      } else {
        descriptions.push("バランスの取れた輪郭");
      }

      // 目の傾斜角度に基づく目型判定
      if (features.eyeSlantAngle > 2) {
        descriptions.push("つり目傾向");
      } else if (features.eyeSlantAngle < -2) {
        descriptions.push("たれ目傾向");
      } else {
        descriptions.push("水平な目");
      }

      // 眉の角度に基づく眉型判定
      if (features.browAngle > -160) {
        descriptions.push("上がり眉");
      } else if (features.browAngle < -200) {
        descriptions.push("下がり眉");
      } else {
        descriptions.push("平行眉");
      }

      // 眉の高さ判定
      if (features.browHeight > 0.1) {
        descriptions.push("眉の位置が高め");
      } else if (features.browHeight < 0.07) {
        descriptions.push("眉の位置が低め");
      }

      // 両目の間隔判定
      if (features.interocularDistance > 0.35) {
        descriptions.push("両目の間隔が広め");
      } else if (features.interocularDistance < 0.28) {
        descriptions.push("両目の間隔が狭め");
      }

      // 鼻の幅判定
      if (features.noseWidth > 0.2) {
        descriptions.push("鼻の幅が広め");
      } else if (features.noseWidth < 0.15) {
        descriptions.push("鼻の幅が狭め");
      }

      // 鼻の高さ判定
      if (features.noseHeight > 0.12) {
        descriptions.push("鼻筋が通っている");
      } else if (features.noseHeight < 0.1) {
        descriptions.push("低い鼻筋");
      }

      // 口の幅判定
      if (features.mouthWidth > 0.4) {
        descriptions.push("口が大きめ");
      } else if (features.mouthWidth < 0.3) {
        descriptions.push("口が小さめ");
      }

      // 唇の厚み判定
      if (features.lipThickness > 0.025) {
        descriptions.push("厚い唇");
      } else if (features.lipThickness < 0.015) {
        descriptions.push("薄い唇");
      }

      // 顎の尖り具合判定
      if (features.jawSharpness > 0.6) {
        descriptions.push("シャープな顎");
      } else if (features.jawSharpness < 0.3) {
        descriptions.push("丸い顎");
      }

      // 頬骨の突出度判定（名称を正確に修正）
      if (features.cheekFullness > 0.15) {
        descriptions.push("頬骨が際立っている");
      } else if (features.cheekFullness < 0.1) {
        descriptions.push("頬骨が控えめ");
      }

      // 鼻の突出度判定（3D情報活用）
      if (features.noseProjection > 0.02) {
        descriptions.push("立体的な鼻");
      } else if (features.noseProjection < 0.01) {
        descriptions.push("平坦な鼻");
      }

      // 複合的な体型判定ロジック（複数パラメータを組み合わせ）
      const bodyTypeScore = calculateBodyTypeScore(features);
      if (bodyTypeScore >= 2) {
        descriptions.push("ふくよか傾向");
      } else if (bodyTypeScore <= -2) {
        descriptions.push("痩せ型傾向");
      } else {
        descriptions.push("標準体型");
      }

    } catch (error) {
      console.error('顔特徴説明生成エラー:', error);
      descriptions.push("特徴解析中にエラーが発生しました");
    }

    return descriptions;
  };

  // ランドマーク描画関数
  const drawLandmarks = (ctx: CanvasRenderingContext2D, landmarks: Array<{x: number, y: number, z?: number}>, width: number, height: number) => {
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;

    const faceOval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
    const leftEye = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
    const rightEye = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
    const lips = [61, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
    const nose = [1, 2, 5, 4, 6, 168, 8, 9, 10, 151, 195, 197, 196, 3, 51, 48, 115, 131, 134, 102, 49, 220, 305, 290, 328, 326];

    [
      { points: faceOval, color: '#00FF00' },
      { points: leftEye, color: '#FF3333' },
      { points: rightEye, color: '#FF3333' },
      { points: lips, color: '#3333FF' },
      { points: nose, color: '#FFFF33' }
    ].forEach(({ points, color }) => {
      ctx.fillStyle = color;
      points.forEach((index) => {
        if (landmarks[index]) {
          const x = landmarks[index].x * width;
          const y = landmarks[index].y * height;
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    });

    ctx.globalAlpha = 1.0;
  };

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          MediaPipe Face Landmarks
        </h1>
        <h2 className="text-2xl font-semibold text-gray-700">
          ローカル実証テストアプリ
        </h2>
      </div>

      {/* 初期化プログレス */}
      {initProgress < 100 && (
        <div className="max-w-md mx-auto mb-8">
          <div className="bg-white rounded-lg p-6 shadow-lg">
            <div className="text-center mb-4">
              <div className="text-lg font-semibold text-gray-700">{status}</div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${initProgress}%` }}
              ></div>
            </div>
            <div className="text-center mt-2 text-sm text-gray-600">
              {initProgress}%
            </div>
          </div>
        </div>
      )}

      {faceLandmarkerVideo && faceLandmarkerImage && (
        <>
          <div className="text-center mb-8">
            <div className={`inline-block px-6 py-3 rounded-full text-lg font-semibold ${
              status.includes('❌') ? 'bg-red-100 text-red-700' : 
              status.includes('✅') ? 'bg-green-100 text-green-700' : 
              'bg-blue-100 text-blue-700'
            }`}>
              {status}
            </div>
          </div>

          {/* モード選択タブ（写真モードのみ） */}
          {/* <div className="flex justify-center mb-8">
            <div className="bg-white rounded-xl p-1 shadow-lg">
              <div className="px-8 py-3 rounded-lg font-semibold bg-green-500 text-white shadow-lg">
                📷 写真アップロードモード
              </div>
            </div>
          </div> */}

          {/* 写真アップロードモード */}
          {detectionMode === 'photo' && (
            <div className="mb-8">
              <div className="text-center mb-6">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!faceLandmarkerImage || isAnalyzing}
                  className="px-10 py-4 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-xl font-bold text-lg disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-200 shadow-lg"
                >
                  {isAnalyzing ? '🔄 解析中...' : '📁 写真を選択してアップロード'}
                </button>
                <p className="text-sm text-gray-600 mt-2">
                  JPG, PNG, GIF, WebP対応 / 最大10MB (HEIC/HEIF非対応)
                </p>
              </div>

              {uploadedImage && (
                <div className="flex justify-center mb-6">
                  <div className="relative max-w-4xl">
                    {!photoFeatures && (
                      <div className="relative">
                        <img
                          src={uploadedImage}
                          alt="アップロードされた画像"
                          className="border-4 border-gray-300 rounded-lg shadow-xl max-w-full h-auto"
                          style={{ maxHeight: '600px' }}
                        />
                        {!isAnalyzing && (
                          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                            <button
                              onClick={() => startAnalysis()}
                              className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition-all duration-200 transform hover:scale-105"
                            >
                              🔍 顔解析を開始
                            </button>
                          </div>
                        )}
                        {isAnalyzing && (
                          <div className="absolute inset-0 bg-black bg-opacity-20 rounded-lg flex items-center justify-center">
                            <div className="bg-white bg-opacity-95 px-6 py-4 rounded-lg text-gray-700 font-semibold max-w-sm w-full mx-4">
                              <div className="text-center mb-3">
                                <div className="text-lg mb-1">🔄 解析中...</div>
                                <div className="text-sm text-gray-600">{analysisStep}</div>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-3">
                                <div 
                                  className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                                  style={{ width: `${analysisProgress}%` }}
                                ></div>
                              </div>
                              <div className="text-center mt-2 text-sm text-gray-600">
                                {analysisProgress}%
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {(photoFeatures || isAnalyzing) && (
                      <canvas
                        ref={photoCanvasRef}
                        className="border-4 border-green-300 rounded-lg shadow-xl max-w-full h-auto"
                        style={{ display: photoFeatures ? 'block' : 'none' }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}


          {/* 検出結果表示 */}
          {(detectionMode === 'photo' && photoFeatures) && (
            <>
              <div className="bg-white rounded-2xl p-8 mb-8 shadow-xl">
                <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">🎯 検出された顔特徴量</h2>
              
              {(() => {
                const currentFeatures = photoFeatures;
                const uiFeatures = currentFeatures ? calculateUIFriendlyFeatures(currentFeatures) : null;
                const adjustments = currentFeatures ? predictVRMAdjustments(currentFeatures) : null;
                
                // ベースライン値（標準的な値として設定）
                const baselines = {
                  eyeSize: 0.004,            // eyeWidth * eyeHeight の標準値（調整済み）
                  eyeShape: 0,               // 傾斜角度0度が標準
                  eyeDistance: 0.32,         // 両目間隔の標準値
                  noseWidth: 0.17,           // 鼻幅の標準値
                  noseHeight: 0.12,          // 鼻高の標準値
                  mouthWidth: 0.35,          // 口幅の標準値
                  lipThickness: 0.022,       // 唇厚の標準値
                  faceShape: 1.25,           // 顔縦横比の標準値
                  jawShape: 0.5              // 顎の標準値
                };
                
                return (
                  <>
                    {/* カテゴリ別特徴量表示 */}
                    {uiFeatures && (
                      <div className="space-y-6 mb-8">
                        {/* 目の調整 */}
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200">
                          <h3 className="font-bold text-blue-800 mb-4 text-lg flex items-center">
                            👁️ 目の調整
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-400">
                              <h4 className="font-semibold text-blue-700 text-sm mb-2">目の大きさ</h4>
                              <div className="text-lg font-bold text-blue-900 mb-1">
                                {getRelativeExpression(uiFeatures.eyeSize, baselines.eyeSize, '大きく', '小さく')}
                              </div>
                              <div className="text-xs text-gray-600">
                                数値: {uiFeatures.eyeSize.toFixed(6)}
                              </div>
                              <div className="text-xs font-bold text-blue-600">
                                morph: {Math.min(100, Math.max(0, Math.round((uiFeatures.eyeSize / baselines.eyeSize - 1) * 100 + 50)))}%
                              </div>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-400">
                              <h4 className="font-semibold text-blue-700 text-sm mb-2">目の縦横比</h4>
                              <div className="text-lg font-bold text-blue-900 mb-1">
                                {uiFeatures.eyeShape > 2 ? 'つり目' : uiFeatures.eyeShape < -2 ? 'たれ目' : '標準的'}
                              </div>
                              <div className="text-xs text-gray-600">
                                角度: {uiFeatures.eyeShape.toFixed(2)}°
                              </div>
                              <div className="text-xs font-bold text-blue-600">
                                morph: {normalizeParam(uiFeatures.eyeShape, 'eyeTilt') ? Math.round(normalizeParam(uiFeatures.eyeShape, 'eyeTilt') * 100) : 50}%
                              </div>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-400">
                              <h4 className="font-semibold text-blue-700 text-sm mb-2">両目の間隔</h4>
                              <div className="text-lg font-bold text-blue-900 mb-1">
                                {getRelativeExpression(uiFeatures.eyeDistance, baselines.eyeDistance, '遠く', '近く')}
                              </div>
                              <div className="text-xs text-gray-600">
                                数値: {uiFeatures.eyeDistance.toFixed(4)}
                              </div>
                              <div className="text-xs font-bold text-blue-600">
                                morph: {normalizeParam(uiFeatures.eyeDistance, 'eyeGap') ? Math.round(normalizeParam(uiFeatures.eyeDistance, 'eyeGap') * 100) : 50}%
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 鼻の調整 */}
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200">
                          <h3 className="font-bold text-green-800 mb-4 text-lg flex items-center">
                            👃 鼻の調整
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green-400">
                              <h4 className="font-semibold text-green-700 text-sm mb-2">鼻の幅</h4>
                              <div className="text-lg font-bold text-green-900 mb-1">
                                {getRelativeExpression(uiFeatures.noseWidth, baselines.noseWidth, '太く', '細く')}
                              </div>
                              <div className="text-xs text-gray-600">
                                数値: {uiFeatures.noseWidth.toFixed(4)}
                              </div>
                              <div className="text-xs font-bold text-green-600">
                                morph: {normalizeParam(uiFeatures.noseWidth, 'noseWidth') ? Math.round(normalizeParam(uiFeatures.noseWidth, 'noseWidth') * 100) : 50}%
                              </div>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green-400">
                              <h4 className="font-semibold text-green-700 text-sm mb-2">鼻の高さ</h4>
                              <div className="text-lg font-bold text-green-900 mb-1">
                                {getRelativeExpression(uiFeatures.noseHeight, baselines.noseHeight, '高く', '低く')}
                              </div>
                              <div className="text-xs text-gray-600">
                                数値: {uiFeatures.noseHeight.toFixed(4)}
                              </div>
                              <div className="text-xs font-bold text-green-600">
                                morph: {normalizeParam(uiFeatures.noseHeight, 'noseLength') ? Math.round(normalizeParam(uiFeatures.noseHeight, 'noseLength') * 100) : 50}%
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 口の調整 */}
                        <div className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-6 border-2 border-red-200">
                          <h3 className="font-bold text-red-800 mb-4 text-lg flex items-center">
                            👄 口の調整
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-red-400">
                              <h4 className="font-semibold text-red-700 text-sm mb-2">口の幅</h4>
                              <div className="text-lg font-bold text-red-900 mb-1">
                                {getRelativeExpression(uiFeatures.mouthWidth, baselines.mouthWidth, '大きく', '小さく')}
                              </div>
                              <div className="text-xs text-gray-600">
                                数値: {uiFeatures.mouthWidth.toFixed(4)}
                              </div>
                              <div className="text-xs font-bold text-red-600">
                                morph: {normalizeParam(uiFeatures.mouthWidth, 'mouthWidth') ? Math.round(normalizeParam(uiFeatures.mouthWidth, 'mouthWidth') * 100) : 50}%
                              </div>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-red-400">
                              <h4 className="font-semibold text-red-700 text-sm mb-2">唇の厚さ</h4>
                              <div className="text-lg font-bold text-red-900 mb-1">
                                {getRelativeExpression(uiFeatures.lipThickness, baselines.lipThickness, '厚く', '薄く')}
                              </div>
                              <div className="text-xs text-gray-600">
                                数値: {uiFeatures.lipThickness.toFixed(4)}
                              </div>
                              <div className="text-xs font-bold text-red-600">
                                morph: {normalizeParam(uiFeatures.lipThickness, 'lipThick') ? Math.round(normalizeParam(uiFeatures.lipThickness, 'lipThick') * 100) : 50}%
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 顔の輪郭 */}
                        <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl p-6 border-2 border-purple-200">
                          <h3 className="font-bold text-purple-800 mb-4 text-lg flex items-center">
                            🎭 顔の輪郭
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-purple-400">
                              <h4 className="font-semibold text-purple-700 text-sm mb-2">顔の幅</h4>
                              <div className="text-lg font-bold text-purple-900 mb-1">
                                {uiFeatures.faceShape > 1.35 ? '面長' : uiFeatures.faceShape < 1.15 ? '丸顔' : '標準的'}
                              </div>
                              <div className="text-xs text-gray-600">
                                縦横比: {uiFeatures.faceShape.toFixed(4)}
                              </div>
                              <div className="text-xs font-bold text-purple-600">
                                morph: {normalizeParam(uiFeatures.faceShape, 'faceRatio') ? Math.round(normalizeParam(uiFeatures.faceShape, 'faceRatio') * 100) : 50}%
                              </div>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-purple-400">
                              <h4 className="font-semibold text-purple-700 text-sm mb-2">顎の形</h4>
                              <div className="text-lg font-bold text-purple-900 mb-1">
                                {uiFeatures.jawShape > 0.6 ? 'シャープ' : uiFeatures.jawShape < 0.4 ? '丸み' : '標準的'}
                              </div>
                              <div className="text-xs text-gray-600">
                                数値: {uiFeatures.jawShape.toFixed(4)}
                              </div>
                              <div className="text-xs font-bold text-purple-600">
                                morph: {normalizeParam(uiFeatures.jawShape, 'jawAngle') ? Math.round(normalizeParam(uiFeatures.jawShape, 'jawAngle') * 100) : 50}%
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 処理時間表示 */}
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="text-center text-sm text-gray-600">
                            処理時間: {currentFeatures?.processingTime.toFixed(2)}ms
                          </div>
                        </div>
                      </div>
                    )}

                    {/* VRM調整予測 */}
                    {adjustments && (
                      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border-2 border-blue-200">
                        <h3 className="font-bold text-blue-800 mb-4 text-xl flex items-center">
                          🎭 VRM BlendShape調整予測
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          {Object.entries(adjustments).map(([key, value]) => (
                            value > 0.01 && (
                              <div key={key} className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-400">
                                <div className="font-semibold text-blue-700 text-sm mb-1">{key}</div>
                                <div className="text-xl font-bold text-blue-900 mb-2">
                                  {(value * 100).toFixed(0)}%
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${value * 100}%` }}
                                  ></div>
                                </div>
                              </div>
                            )
                          ))}
                        </div>
                        <div className="bg-blue-100 p-4 rounded-lg">
                          <p className="text-sm text-blue-700">
                            <strong>💡 VRM調整への活用:</strong> 
                            上記の数値をVRMファイルのBlendShapeに適用することで、
                            写真の人物に似たアバターを自動生成できます。
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 客観的顔特徴説明 */}
                    {currentFeatures && (
                      <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 border-2 border-green-200 mt-6">
                        <h3 className="font-bold text-green-800 mb-4 text-xl flex items-center">
                          📝 検出された顔の特徴
                        </h3>
                        <div className="bg-white rounded-lg p-4 border border-green-200">
                          <p className="text-sm text-gray-600 mb-3">
                            <strong>解析結果に基づく客観的な特徴:</strong>
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {generateFaceDescription(currentFeatures).map((description, index) => (
                              <span
                                key={index}
                                className="inline-block bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium border border-green-300"
                              >
                                {description}
                              </span>
                            ))}
                          </div>
                          <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                            <p className="text-xs text-green-700">
                              <strong>💡 説明:</strong> 
                              上記の特徴は検出された数値データに基づく客観的な分析結果です。
                              これらの情報はVRMアバターの自動調整に活用されます。
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
              </div>

              {/* VRMプレビューは一時的に非表示（ブレンドシェイプ対応モデル実装まで） */}
              {false && showVRM && (
                <div className="bg-white rounded-2xl p-8 mb-8 shadow-xl">
                  <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
                    🎭 VRM アバター プレビュー
                  </h2>
                  <div className="bg-gray-50 rounded-xl p-4 mb-4">
                    <p className="text-center text-gray-600 mb-2">
                      顔特徴量に基づいてVRMアバターが自動調整されます
                    </p>
                  </div>
                  <div style={{ height: '500px' }}>
                    <VRMViewer 
                      faceFeatures={photoFeatures}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* 使用方法・注意事項 */}
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6">
            <h3 className="font-bold text-yellow-800 mb-4 text-xl">
              📋 ローカルテスト時の重要なポイント
            </h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h4 className="font-bold text-blue-700 mb-2">
                💡 開発者コンソールについて
              </h4>
              <p className="text-sm text-blue-700">
                コンソールに表示される「INFO: Created TensorFlow Lite XNNPACK delegate for CPU」や
                「Graph successfully started running」などのメッセージは、MediaPipeの正常な動作ログです。
                エラーではありませんのでご安心ください。
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg">
              <h4 className="font-bold text-green-700 mb-3">
                📷 写真モードの特徴
              </h4>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>• <strong>高精度な特徴量測定:</strong> 17種類の詳細な顔特徴を正確に分析</li>
                <li>• <strong>客観的特徴説明:</strong> 検出データに基づく日本語説明を自動生成</li>
                <li>• <strong>VRM調整予測:</strong> BlendShape適用値の詳細プレビュー</li>
                <li>• <strong>対応形式:</strong> JPG, PNG, GIF, WebP（最大10MB）</li>
                <li>• <strong>環境要件:</strong> HTTP/HTTPS環境で動作</li>
                <li>• <strong>テスト活用:</strong> 様々な人物での比較・検証が可能</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
