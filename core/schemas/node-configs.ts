import { Type } from "@sinclair/typebox";

export default Type.Object({
  id: Type.String(),
  type: Type.String(),
  name: Type.String(),
  g: Type.Optional(Type.String()),
  z: Type.Optional(Type.String()),
});
