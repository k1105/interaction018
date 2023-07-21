import dynamic from "next/dynamic";
import p5Types from "p5";
import { MutableRefObject, useRef } from "react";
import { Hand } from "@tensorflow-models/hand-pose-detection";
import { getSmoothedHandpose } from "../lib/getSmoothedHandpose";
import { updateHandposeHistory } from "../lib/updateHandposeHistory";
import { Keypoint } from "@tensorflow-models/hand-pose-detection";
import { convertHandToHandpose } from "../lib/converter/convertHandToHandpose";
import { isFront } from "../lib/calculator/isFront";
import { Monitor } from "../components/Monitor";
import Matter from "matter-js";
import { getCurrentPosition } from "../lib/getCurrentPosition";

type Props = {
  handpose: MutableRefObject<Hand[]>;
};

const mainColor = 220;

type Handpose = Keypoint[];

const Sketch = dynamic(import("react-p5"), {
  loading: () => <></>,
  ssr: false,
});

export const HandSketch = ({ handpose }: Props) => {
  const r = 150; // <の長さ.
  const offset = 60; // 左右の手指の出力位置の間隔
  const scale = 1; // 指先と付け根の距離の入力値に対する、出力時に使うスケール比。
  const circleSize = 200;

  // module aliases
  let Engine = Matter.Engine,
    Bodies = Matter.Bodies,
    Composite = Matter.Composite;
  const edges: Matter.Body[] = [];
  for (let i = 0; i < 20; i++) {
    edges.push(
      Bodies.rectangle(
        window.innerWidth / 2,
        (window.innerHeight / 3) * 2,
        r / 2,
        1,
        { isStatic: true }
      )
    );
  }

  const floor = Bodies.rectangle(
    window.innerWidth / 2,
    (window.innerHeight / 3) * 2.5,
    window.innerWidth / 2,
    10,
    {
      isStatic: true,
    }
  );

  const circle = Bodies.circle(window.innerWidth / 2, -100, circleSize);

  // create an engine
  let engine: Matter.Engine;
  let handposeHistory: {
    left: Handpose[];
    right: Handpose[];
  } = { left: [], right: [] };

  const debugLog = useRef<{ label: string; value: any }[]>([]);
  const distList: number[][] = new Array(5).fill([0, 0]);

  const preload = (p5: p5Types) => {
    // 画像などのロードを行う
  };

  const setup = (p5: p5Types, canvasParentRef: Element) => {
    p5.createCanvas(p5.windowWidth, p5.windowHeight).parent(canvasParentRef);
    p5.stroke(mainColor);
    p5.fill(mainColor);
    p5.strokeWeight(10);

    engine = Engine.create();
    Composite.add(engine.world, [...edges, circle, floor]);
  };

  const draw = (p5: p5Types) => {
    Engine.update(engine);
    const rawHands: {
      left: Handpose;
      right: Handpose;
    } = convertHandToHandpose(handpose.current);
    handposeHistory = updateHandposeHistory(rawHands, handposeHistory); //handposeHistoryの更新
    const hands: {
      left: Handpose;
      right: Handpose;
    } = getSmoothedHandpose(rawHands, handposeHistory); //平滑化された手指の動きを取得する

    // logとしてmonitorに表示する
    debugLog.current = [];
    for (const hand of handpose.current) {
      debugLog.current.push({
        label: hand.handedness + " accuracy",
        value: hand.score,
      });
    }

    // --
    // <> pinky
    // <> ring
    // <> middle
    // <> index
    // <> thumb
    // --
    // if one hand is detected, both side of organ is shrink / extend.
    // if two hands are detected, each side of organ changes according to each hand.

    let start: number = 0;
    let end: number = 0;

    const posArr: { x: number; y: number }[] = [];
    p5.clear();
    if (hands.left.length > 0 || hands.right.length > 0) {
      //右手、左手のうちのどちらかが認識されていた場合
      // 片方の手の動きをもう片方に複製する
      if (hands.left.length == 0) {
        hands.left = hands.right;
      } else if (hands.right.length == 0) {
        hands.right = hands.left;
      }
      //update distList
      for (let n = 0; n < 5; n++) {
        start = 4 * n + 1;
        end = 4 * n + 4;
        distList[n] = [
          (hands.left[end].y - hands.left[start].y) * scale,
          (hands.right[end].y - hands.right[start].y) * scale,
        ];
      }
    }

    p5.push();
    p5.translate(window.innerWidth / 2, (2.5 * window.innerHeight) / 3);

    for (const dist of distList) {
      dist.forEach((d, index) => {
        const sign = (-1) ** (1 - index); //正負の符号
        p5.push();
        p5.translate(sign * offset, 0);
        d = Math.min(Math.max(-r, d), 0);
        posArr.push(getCurrentPosition({ p5 }));
        p5.line(0, 0, (sign * Math.sqrt(r ** 2 - d ** 2)) / 2, d / 2);
        p5.translate((sign * Math.sqrt(r ** 2 - d ** 2)) / 2, d / 2);
        posArr.push(getCurrentPosition({ p5 }));
        p5.line(0, 0, -(sign * Math.sqrt(r ** 2 - d ** 2)) / 2, d / 2);

        p5.translate(-(sign * Math.sqrt(r ** 2 - d ** 2)) / 2, d / 2);
        posArr.push(getCurrentPosition({ p5 }));

        p5.pop();
      });

      //全体座標の回転と高さ方向へのtranslate
      let tmp_l_d = 0;
      let tmp_r_d = 0;

      if (r < Math.abs(dist[0])) {
        tmp_l_d = -r;
      } else if (dist[0] > 0) {
        tmp_l_d = 0;
      } else {
        tmp_l_d = dist[0];
      }
      if (r < Math.abs(dist[1])) {
        tmp_r_d = -r;
      } else if (dist[1] > 0) {
        tmp_r_d = 0;
      } else {
        tmp_r_d = dist[1];
      }

      p5.translate(0, (tmp_l_d + tmp_r_d) / 2);
      //yBase += (tmp_l_d + tmp_r_d) / 2;
      p5.rotate(-Math.atan2(tmp_l_d - tmp_r_d, 2 * offset));
    }

    p5.pop();

    p5.push();
    p5.noStroke();
    if (circle.position.y > 2000) {
      Matter.Body.setPosition(circle, { x: window.innerWidth / 2, y: -100 });
    }
    p5.circle(circle.position.x, circle.position.y, circleSize * 2);
    p5.rectMode(p5.CENTER);
    if (posArr.length == 30) {
      for (let i = 0; i < 10; i++) {
        const i3 = i * 3;
        const i2 = i * 2;

        Matter.Body.setPosition(
          edges[i2],
          {
            x: (posArr[i3].x + posArr[i3 + 1].x) / 2,
            y: (posArr[i3].y + posArr[i3 + 1].y) / 2,
          }, //@ts-ignore
          true
        );
        Matter.Body.setAngle(
          edges[i2],
          Math.atan2(
            posArr[i3 + 1].y - posArr[i3].y,
            posArr[i3 + 1].x - posArr[i3].x
          )
        );
        Matter.Body.setPosition(
          edges[i2 + 1],
          {
            x: (posArr[i3 + 1].x + posArr[i3 + 2].x) / 2,
            y: (posArr[i3 + 1].y + posArr[i3 + 2].y) / 2,
          }, //@ts-ignore
          true
        );
        Matter.Body.setAngle(
          edges[i2 + 1],
          Math.atan2(
            posArr[i3 + 2].y - posArr[i3 + 1].y,
            posArr[i3 + 2].x - posArr[i3 + 1].x
          ), //@ts-ignore
          true
        );

        // p5.push();
        // p5.translate(edges[i2].position.x, edges[i2].position.y);
        // p5.rotate(edges[i2].angle);
        // p5.rect(0, 0, r / 2, 10);
        // p5.pop();
        // p5.push();
        // p5.translate(edges[i2 + 1].position.x, edges[i2 + 1].position.y);
        // p5.rotate(edges[i2 + 1].angle);
        // p5.rect(0, 0, r / 2, 10);
        // p5.pop();
        p5.rect(floor.position.x, floor.position.y, window.innerWidth / 2, 10);
      }
    }
    p5.pop();
  };

  const windowResized = (p5: p5Types) => {
    p5.resizeCanvas(p5.windowWidth, p5.windowHeight);
  };

  return (
    <>
      <Monitor handpose={handpose} debugLog={debugLog} />
      <Sketch
        preload={preload}
        setup={setup}
        draw={draw}
        windowResized={windowResized}
      />
    </>
  );
};
