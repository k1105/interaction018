import p5Types from "p5";

type Props = {
  p5: p5Types;
};

export const getCurrentPosition = ({ p5 }: Props) => {
  //@ts-ignore
  const matrix = p5.drawingContext.getTransform();
  const x_0 = matrix["e"];
  const y_0 = matrix["f"];
  const x_1 = matrix["a"] + matrix["e"];
  const y_1 = matrix["b"] + matrix["f"];
  const media_per_unit = p5.dist(x_0, y_0, x_1, y_1);
  return { x: x_0 / media_per_unit, y: y_0 / media_per_unit };
};
