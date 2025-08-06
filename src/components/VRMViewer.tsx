'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';

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
  cheekFullness: number; // 頬のふくらみ（肉付き）
  mouthWidth: number;
  mouthHeight: number;
  lipThickness: number; // 唇の厚み（上唇と下唇の平均厚み）
  faceAspectRatio: number;
  jawSharpness: number; // 顎の尖り具合（高い値ほどシャープ）
  interocularDistance: number;
  processingTime: number;
}

interface VRMViewerProps {
  faceFeatures: FaceFeatures | null;
}

export default function VRMViewer({ faceFeatures }: VRMViewerProps) {
  const selectedVRM = '/vrm-models/f_0_20.vrm';
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const initRef = useRef(false);
  const isCleanedUpRef = useRef(false);
  const isLoadingRef = useRef(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string>('');
  const [appliedShapes, setAppliedShapes] = useState<string[]>([]);
  const [notFoundShapes, setNotFoundShapes] = useState<string[]>([]);
  const [availableShapes, setAvailableShapes] = useState<string[]>([]);

  // Three.js初期化
  useEffect(() => {
    if (initRef.current || isCleanedUpRef.current || !containerRef.current) {
      return;
    }
    
    initRef.current = true;
    console.log('🚀 VRMViewer初期化開始');

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1.5, 3);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setClearColor(0xf0f0f0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      if (vrmRef.current) {
        vrmRef.current.update(0.016); // ~60fps
      }
      
      renderer.render(scene, camera);
    };
    animate();

    // 初期化完了後にVRMを読み込み（1回のみ、少し遅延）
    console.log('📦 初期化完了後のVRM読み込み開始');
    setTimeout(() => {
      if (!isCleanedUpRef.current && initRef.current) {
        console.log('📦 遅延後のVRM読み込み実行');
        loadVRM(selectedVRM);
      } else {
        console.log('❌ 遅延後のVRM読み込みキャンセル: コンポーネント状態変更');
      }
    }, 100);

    // Cleanup function
    return () => {
      console.log('🧹 VRMViewer クリーンアップ');
      isCleanedUpRef.current = true;
      isLoadingRef.current = false;
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (vrmRef.current) {
        scene.remove(vrmRef.current.scene);
        vrmRef.current = null;
      }
      
      const container = containerRef.current;
      if (renderer && container?.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      
      renderer?.dispose();
      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      initRef.current = false;
    };
  }, []);

  // VRM読み込み
  const loadVRM = async (vrmPath: string) => {
    if (!sceneRef.current || !cameraRef.current || isCleanedUpRef.current || !initRef.current) {
      console.error('❌ VRM読み込み失敗: 条件不満足', {
        hasScene: !!sceneRef.current,
        hasCamera: !!cameraRef.current,
        isCleanedUp: isCleanedUpRef.current,
        isInit: initRef.current
      });
      return;
    }

    // 既に読み込み中の場合は処理を中断
    if (isLoadingRef.current) {
      console.log('⚠️ VRM読み込み中断: 既に読み込み処理中', vrmPath);
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    setLoadingError('');
    console.log('📦 VRM読み込み開始:', vrmPath);

    try {
      // 既存のVRMを削除
      if (vrmRef.current && sceneRef.current) {
        sceneRef.current.remove(vrmRef.current.scene);
        vrmRef.current = null;
      }

      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      const gltf = await loader.loadAsync(vrmPath);
      
      // 読み込み後のクリーンアップチェック
      if (isCleanedUpRef.current || !initRef.current) {
        console.log('❌ VRM読み込み中断: コンポーネント状態変更');
        isLoadingRef.current = false;
        setIsLoading(false);
        return;
      }
      
      const vrm = gltf.userData.vrm as VRM;

      if (vrm && sceneRef.current) {
        // VRM0形式の回転補正（重要！）
        VRMUtils.rotateVRM0(vrm);
        
        sceneRef.current.add(vrm.scene);
        vrmRef.current = vrm;

        // カメラ位置調整（詳細版）
        const adjustCameraPosition = (sceneToAdd: THREE.Object3D) => {
          const box = new THREE.Box3().setFromObject(sceneToAdd);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          
          let cameraX, cameraY, cameraZ;
          
          if (maxDim < 0.5) {
            cameraX = 0;
            cameraY = center.y;
            cameraZ = 1.5;
          } else if (maxDim < 2.0) {
            cameraX = center.x;
            cameraY = center.y;
            cameraZ = maxDim * 1.5;
          } else {
            const fov = cameraRef.current!.fov * (Math.PI / 180);
            cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.2;
            cameraX = center.x;
            cameraY = center.y + size.y / 4;
          }
          
          cameraRef.current!.position.set(cameraX, cameraY, cameraZ);
          cameraRef.current!.lookAt(center);
          
          console.log('📹 カメラ位置調整完了:', {
            center: center,
            size: size,
            maxDim: maxDim,
            cameraPosition: { x: cameraX, y: cameraY, z: cameraZ }
          });
        };
        
        adjustCameraPosition(vrm.scene);

        console.log('✅ VRM読み込み成功');
        console.log('VRM scene added to Three.js scene');
        console.log('VRM object:', vrm);
        console.log('🔄 重複読み込み対策状態:', {
          isLoadingRef: isLoadingRef.current,
          isCleanedUp: isCleanedUpRef.current,
          isInit: initRef.current
        });
        
        // 利用可能なBlendShapeを取得
        if (vrm.expressionManager) {
          const availableExpressions = Object.keys(vrm.expressionManager.expressionMap);
          console.log('🎭 利用可能なBlendShape:', availableExpressions);
          setAvailableShapes(availableExpressions);
          
          // 顔特徴量があれば適用
          if (faceFeatures) {
            applyFaceFeaturesToVRM(vrm, faceFeatures);
          }
        }
      }
    } catch (error) {
      console.error('❌ VRM読み込み失敗:', error);
      setLoadingError(`VRM読み込みエラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  };

  // MediaPipe特徴量をVRM BlendShapeに適用
  const applyFaceFeaturesToVRM = (vrm: VRM, features: FaceFeatures) => {
    if (!vrm.expressionManager) return;

    console.log('🎯 MediaPipe特徴量をVRMに適用開始');
    console.log('📊 検出された特徴量:', {
      eyeWidth: features.eyeWidth,
      eyeHeight: features.eyeHeight,
      eyeAspectRatio: features.eyeAspectRatio,
      noseWidth: features.noseWidth,
      mouthWidth: features.mouthWidth,
      faceAspectRatio: features.faceAspectRatio
    });

    // 基準値（平均的な日本人の顔）
    const baseline = {
      eyeAspectRatio: 0.25,
      noseWidth: 0.05,
      mouthWidth: 0.07,
      faceAspectRatio: 1.3
    };

    const adjustments: Record<string, number> = {};

    // 利用可能なBlendShapeを取得
    const availableExpressions = vrm.expressionManager ? Object.keys(vrm.expressionManager.expressionMap) : [];
    console.log('🎭 マッピング対象BlendShape:', availableExpressions);

    // 目の特徴をBlendShapeにマッピング
    const eyeRatio = features.eyeAspectRatio / baseline.eyeAspectRatio;
    if (eyeRatio < 0.8) {
      // 目が細い → blinkやrelaxedを適用
      if (availableExpressions.includes('blink')) {
        adjustments.blink = Math.min((1 - eyeRatio) * 0.3, 0.5);
      }
      if (availableExpressions.includes('relaxed')) {
        adjustments.relaxed = Math.min((1 - eyeRatio) * 0.4, 1.0);
      }
    }

    // 目の傾斜角度をBlendShapeにマッピング
    if (features.eyeSlantAngle > 2) {
      // つり目
      if (availableExpressions.includes('angry')) {
        adjustments.angry = Math.min(features.eyeSlantAngle / 10, 0.6);
      }
    } else if (features.eyeSlantAngle < -2) {
      // たれ目
      if (availableExpressions.includes('sad')) {
        adjustments.sad = Math.min(Math.abs(features.eyeSlantAngle) / 10, 0.5);
      }
    }

    // 眉の角度をBlendShapeにマッピング
    // 眉の角度が-180度に近い場合は下がり眉
    const browAngleNormalized = Math.abs(features.browAngle + 180);
    if (browAngleNormalized < 30) {
      // 下がり眉 → sadやtroubledを適用
      if (availableExpressions.includes('sad')) {
        adjustments.sad = Math.max(adjustments.sad || 0, Math.min((30 - browAngleNormalized) / 30 * 0.4, 0.6));
      }
      if (availableExpressions.includes('troubled')) {
        adjustments.troubled = Math.min((30 - browAngleNormalized) / 30 * 0.5, 0.7);
      }
    }

    // 唇の厚みをBlendShapeにマッピング
    if (features.lipThickness < 0.008) {
      // 薄い唇
      if (availableExpressions.includes('neutral')) {
        adjustments.neutral = Math.min((0.008 - features.lipThickness) / 0.008 * 0.3, 0.4);
      }
    } else if (features.lipThickness > 0.015) {
      // 厚い唇
      if (availableExpressions.includes('aa')) {
        adjustments.aa = Math.min((features.lipThickness - 0.015) / 0.01 * 0.2, 0.3);
      }
    }

    // 顎の尖り具合をBlendShapeにマッピング
    if (features.jawSharpness > 0.7) {
      // シャープな顎
      if (availableExpressions.includes('angry')) {
        adjustments.angry = Math.max(adjustments.angry || 0, Math.min((features.jawSharpness - 0.7) / 0.3 * 0.3, 0.4));
      }
    } else if (features.jawSharpness < 0.3) {
      // 丸い顎
      if (availableExpressions.includes('happy')) {
        adjustments.happy = Math.max(adjustments.happy || 0, Math.min((0.3 - features.jawSharpness) / 0.3 * 0.2, 0.3));
      }
    }

    // 口の特徴をBlendShapeにマッピング
    const mouthRatio = features.mouthWidth / baseline.mouthWidth;
    if (mouthRatio > 1.1) {
      // 口が大きい → happyやaaを適用
      if (availableExpressions.includes('happy')) {
        adjustments.happy = Math.min((mouthRatio - 1) * 0.6, 1.0);
      }
      if (availableExpressions.includes('aa')) {
        adjustments.aa = Math.min((mouthRatio - 1) * 0.3, 0.5);
      }
    } else if (mouthRatio < 0.9) {
      // 口が小さい → neutralやsadを適用
      if (availableExpressions.includes('sad')) {
        adjustments.sad = Math.min((1 - mouthRatio) * 0.4, 1.0);
      }
      if (availableExpressions.includes('neutral')) {
        adjustments.neutral = Math.min((1 - mouthRatio) * 0.2, 0.5);
      }
    }

    // 顔の縦横比に基づいた表情調整
    const faceRatio = features.faceAspectRatio / baseline.faceAspectRatio;
    if (faceRatio > 1.15) {
      // 顔が縦長 → surprisedを適用
      if (availableExpressions.includes('Surprised')) {
        adjustments.Surprised = Math.min((faceRatio - 1) * 0.5, 1.0);
      }
    }

    // 鼻の特徴に基づいた微調整
    const noseRatio = features.noseWidth / baseline.noseWidth;
    if (noseRatio > 1.2) {
      // 鼻が大きい → angryで強めの表情
      if (availableExpressions.includes('angry')) {
        adjustments.angry = Math.min((noseRatio - 1) * 0.3, 0.6);
      }
    }

    // VRMに適用
    let appliedCount = 0;
    const appliedShapes: string[] = [];
    const notFoundShapes: string[] = [];
    const skippedShapes: string[] = [];
    
    Object.entries(adjustments).forEach(([key, value]) => {
      if (value > 0.01) {
        const expression = vrm.expressionManager?.expressionMap[key];
        if (expression) {
          expression.weight = value;
          appliedCount++;
          appliedShapes.push(`${key} (${(value * 100).toFixed(1)}%)`);
          console.log(`✅ BlendShape適用: ${key} = ${(value * 100).toFixed(1)}%`);
        } else {
          notFoundShapes.push(key);
          console.log(`⚠️ BlendShape未発見: ${key}`);
        }
      } else {
        skippedShapes.push(`${key} (${(value * 100).toFixed(1)}%)`);
      }
    });

    // 結果サマリーを表示
    console.log(`🎭 VRM調整完了サマリー:`);
    console.log(`  ✅ 適用済み (${appliedCount}個): ${appliedShapes.length > 0 ? appliedShapes.join(', ') : 'なし'}`);
    console.log(`  ⚠️ 未発見 (${notFoundShapes.length}個): ${notFoundShapes.length > 0 ? notFoundShapes.join(', ') : 'なし'}`);
    console.log(`  ⏭️ スキップ (${skippedShapes.length}個): ${skippedShapes.length > 0 ? skippedShapes.join(', ') : 'なし'}`);

    // UI状態を更新
    setAppliedShapes(appliedShapes);
    setNotFoundShapes(notFoundShapes);
  };

  // selectedVRMが変更されたらVRMを読み込む（削除：初期化時に1回のみ読み込むため）
  // useEffect(() => {
  //   if (selectedVRM && sceneRef.current) {
  //     loadVRM(selectedVRM);
  //   }
  // }, [selectedVRM]);

  // faceFeatures が変更されたらVRMを更新
  useEffect(() => {
    if (faceFeatures && vrmRef.current) {
      applyFaceFeaturesToVRM(vrmRef.current, faceFeatures);
    }
  }, [faceFeatures]);

  return (
    <div className="w-full h-full relative">
      <div 
        ref={containerRef}
        className="w-full h-full rounded-lg overflow-hidden border-2 border-gray-200"
        style={{ minHeight: '400px', backgroundColor: '#f0f0f0' }}
      />
      
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
          <div className="bg-white p-4 rounded-lg">
            <p className="text-gray-700">🔄 VRM読み込み中...</p>
          </div>
        </div>
      )}

      {loadingError && (
        <div className="absolute top-4 left-4 right-4 bg-red-100 border border-red-300 rounded-lg p-3">
          <p className="text-red-700">❌ {loadingError}</p>
        </div>
      )}

      {faceFeatures && (
        <div className="absolute top-4 right-4 bg-white bg-opacity-95 p-4 rounded-lg text-sm max-w-sm max-h-96 overflow-y-auto">
          <h4 className="font-semibold mb-3 text-gray-800">🎭 BlendShape適用状況</h4>
          
          {/* 適用済みBlendShape */}
          {appliedShapes.length > 0 && (
            <div className="mb-3">
              <h5 className="font-medium text-green-700 mb-1">✅ 適用済み ({appliedShapes.length}個)</h5>
              {appliedShapes.map((shape, index) => (
                <div key={index} className="text-green-600 text-xs ml-2">• {shape}</div>
              ))}
            </div>
          )}
          
          {/* 未発見BlendShape */}
          {notFoundShapes.length > 0 && (
            <div className="mb-3">
              <h5 className="font-medium text-orange-700 mb-1">⚠️ 未発見 ({notFoundShapes.length}個)</h5>
              {notFoundShapes.map((shape, index) => (
                <div key={index} className="text-orange-600 text-xs ml-2">• {shape}</div>
              ))}
            </div>
          )}
          
          {/* 利用可能なBlendShape */}
          {availableShapes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <h5 className="font-medium text-blue-700 mb-1">📋 利用可能 ({availableShapes.length}個)</h5>
              <div className="max-h-32 overflow-y-auto">
                <div className="grid grid-cols-2 gap-1">
                  {availableShapes.map((shape, index) => (
                    <div key={index} className="text-blue-600 text-xs">• {shape}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}