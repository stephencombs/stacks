declare module "*.css";

declare module "*.xml" {
  const source: number;
  export default source;
}
