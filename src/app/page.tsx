'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import VRMViewer from '@/components/VRMViewer';

interface FaceFeatures {
  eyeWidth: number;
  eyeHeight: number;
  eyeAspectRatio: number;
  noseWidth: number;
  noseHeight: number;
  mouthWidth: number;
  mouthHeight: number;
  faceAspectRatio: number;
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
  
  // Camera State
  const [isRunning, setIsRunning] = useState(false);
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
        const filterMediaPipeLog = (args: any[]) => {
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
      requestAnimationFrame(detectFaceFromVideo);
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
  }, [faceLandmarkerImage]);

  // 詳細特徴量計算
  const calculateDetailedFeatures = (landmarks: any[], processingTime: number): FaceFeatures => {
    try {
      // 目の特徴（左目基準）
      const leftEyeOuter = landmarks[33];
      const leftEyeInner = landmarks[133];
      const leftEyeTop = landmarks[159];
      const leftEyeBottom = landmarks[145];

      const eyeWidth = Math.hypot(
        leftEyeOuter.x - leftEyeInner.x,
        leftEyeOuter.y - leftEyeInner.y
      );

      const eyeHeight = Math.hypot(
        leftEyeTop.x - leftEyeBottom.x,
        leftEyeTop.y - leftEyeBottom.y
      );

      const eyeAspectRatio = eyeHeight / eyeWidth;

      // 両目の間隔
      const rightEyeInner = landmarks[362];
      const interocularDistance = Math.hypot(
        leftEyeInner.x - rightEyeInner.x,
        leftEyeInner.y - rightEyeInner.y
      );

      // 鼻の特徴
      const noseLeft = landmarks[131];
      const noseRight = landmarks[360];
      const noseTip = landmarks[1];
      const noseBridge = landmarks[6];

      const noseWidth = Math.hypot(
        noseLeft.x - noseRight.x,
        noseLeft.y - noseRight.y
      );

      const noseHeight = Math.hypot(
        noseTip.x - noseBridge.x,
        noseTip.y - noseBridge.y
      );

      // 口の特徴
      const mouthLeft = landmarks[61];
      const mouthRight = landmarks[291];
      const mouthTop = landmarks[13];
      const mouthBottom = landmarks[14];

      const mouthWidth = Math.hypot(
        mouthLeft.x - mouthRight.x,
        mouthLeft.y - mouthRight.y
      );

      const mouthHeight = Math.hypot(
        mouthTop.x - mouthBottom.x,
        mouthTop.y - mouthBottom.y
      );

      // 顔の輪郭
      const faceTop = landmarks[10];
      const faceBottom = landmarks[152];
      const faceLeft = landmarks[234];
      const faceRight = landmarks[454];

      const faceWidth = Math.hypot(
        faceLeft.x - faceRight.x,
        faceLeft.y - faceRight.y
      );

      const faceHeight = Math.hypot(
        faceTop.x - faceBottom.x,
        faceTop.y - faceBottom.y
      );

      const faceAspectRatio = faceHeight / faceWidth;

      return {
        eyeWidth: Number(eyeWidth.toFixed(4)),
        eyeHeight: Number(eyeHeight.toFixed(4)),
        eyeAspectRatio: Number(eyeAspectRatio.toFixed(4)),
        noseWidth: Number(noseWidth.toFixed(4)),
        noseHeight: Number(noseHeight.toFixed(4)),
        mouthWidth: Number(mouthWidth.toFixed(4)),
        mouthHeight: Number(mouthHeight.toFixed(4)),
        faceAspectRatio: Number(faceAspectRatio.toFixed(4)),
        interocularDistance: Number(interocularDistance.toFixed(4)),
        processingTime: Number(processingTime.toFixed(2))
      };
    } catch (error) {
      console.error('特徴量計算エラー:', error);
      return {
        eyeWidth: 0, eyeHeight: 0, eyeAspectRatio: 0, noseWidth: 0, noseHeight: 0,
        mouthWidth: 0, mouthHeight: 0, faceAspectRatio: 0, interocularDistance: 0,
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

  // ランドマーク描画関数
  const drawLandmarks = (ctx: CanvasRenderingContext2D, landmarks: any[], width: number, height: number) => {
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

          {/* モード選択タブ */}
          <div className="flex justify-center mb-8">
            <div className="bg-white rounded-xl p-1 shadow-lg">
              <button
                onClick={() => setDetectionMode('photo')}
                className={`px-8 py-3 rounded-lg font-semibold transition-all duration-200 ${
                  detectionMode === 'photo'
                    ? 'bg-green-500 text-white shadow-lg transform scale-105'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                📷 写真アップロード（推奨）
              </button>
              <button
                onClick={() => setDetectionMode('camera')}
                className={`px-8 py-3 rounded-lg font-semibold transition-all duration-200 ${
                  detectionMode === 'camera'
                    ? 'bg-blue-500 text-white shadow-lg transform scale-105'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                📹 リアルタイムカメラ
              </button>
            </div>
          </div>

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

          {/* カメラモード */}
          {detectionMode === 'camera' && (
            <div className="mb-8">
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover rounded-lg"
                    autoPlay
                    playsInline
                    muted
                  />
                  <canvas
                    ref={canvasRef}
                    className="relative z-10 border-4 border-blue-300 rounded-lg shadow-xl"
                    width={640}
                    height={480}
                  />
                </div>
              </div>

              <div className="text-center">
                <button
                  onClick={toggleCamera}
                  disabled={!faceLandmarkerVideo}
                  className={`px-10 py-4 rounded-xl font-bold text-lg transition-all duration-200 ${
                    isRunning 
                      ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg' 
                      : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg'
                  } disabled:bg-gray-400 disabled:cursor-not-allowed transform hover:scale-105`}
                >
                  {isRunning ? '🛑 カメラ停止' : '🎬 カメラ起動'}
                </button>
              </div>
            </div>
          )}

          {/* 検出結果表示 */}
          {((detectionMode === 'camera' && cameraFeatures) || (detectionMode === 'photo' && photoFeatures)) && (
            <>
              <div className="bg-white rounded-2xl p-8 mb-8 shadow-xl">
                <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">🎯 検出された顔特徴量</h2>
              
              {(() => {
                const currentFeatures = detectionMode === 'camera' ? cameraFeatures : photoFeatures;
                const adjustments = currentFeatures ? predictVRMAdjustments(currentFeatures) : null;
                
                return (
                  <>
                    {/* 特徴量グリッド */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                      {[
                        { label: '目の幅', value: currentFeatures?.eyeWidth, color: 'blue' },
                        { label: '目の高さ', value: currentFeatures?.eyeHeight, color: 'blue' },
                        { label: '目の縦横比', value: currentFeatures?.eyeAspectRatio, color: 'blue' },
                        { label: '鼻の幅', value: currentFeatures?.noseWidth, color: 'green' },
                        { label: '鼻の高さ', value: currentFeatures?.noseHeight, color: 'green' },
                        { label: '口の幅', value: currentFeatures?.mouthWidth, color: 'red' },
                        { label: '口の高さ', value: currentFeatures?.mouthHeight, color: 'red' },
                        { label: '顔の縦横比', value: currentFeatures?.faceAspectRatio, color: 'purple' },
                        { label: '両目の間隔', value: currentFeatures?.interocularDistance, color: 'orange' },
                        { label: '処理時間', value: `${currentFeatures?.processingTime}ms`, color: 'gray' }
                      ].map((item, index) => (
                        <div key={index} className="bg-white p-4 rounded-xl shadow-md hover:shadow-lg transition-shadow border-2 border-gray-200">
                          <h3 className={`font-semibold text-${item.color}-600 text-sm mb-1`}>{item.label}</h3>
                          <p className="text-xl font-mono font-bold text-gray-800">
                            {typeof item.value === 'number' ? item.value.toFixed(4) : item.value}
                          </p>
                        </div>
                      ))}
                    </div>

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
                  </>
                );
              })()}
              </div>

              {/* VRMプレビュー */}
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
                    faceFeatures={detectionMode === 'camera' ? cameraFeatures : photoFeatures}
                  />
                </div>
              </div>
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
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-bold text-green-700 mb-2">
                  📷 写真モード（推奨）
                </h4>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• 高精度な特徴量測定が可能</li>
                  <li>• VRM調整予測の詳細確認</li>
                  <li>• HTTP環境でも動作</li>
                  <li>• 様々な人物での比較テスト</li>
                  <li>• ファイルサイズ: 最大10MB</li>
                </ul>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-bold text-blue-700 mb-2">
                  📹 カメラモード
                </h4>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• リアルタイムでの数値変化確認</li>
                  <li>• 表情・角度変化のテスト</li>
                  <li>• localhost環境でも動作可能</li>
                  <li>• ブラウザでカメラ許可が必要</li>
                  <li>• 処理速度・安定性の評価</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
