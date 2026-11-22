import { useFonts } from "expo-font";

const faces = [
  {
    fontFamily: "Allo",
    fontDefinitions: [
      { path: require("../../assets/fonts/Allo-Regular.otf"), weight: 400 },
      { path: require("../../assets/fonts/Allo-Medium.otf"), weight: 500 },
      { path: require("../../assets/fonts/Allo-SemiBold.otf"), weight: 600 },
      { path: require("../../assets/fonts/Allo-Bold.otf"), weight: 700 },
      { path: require("../../assets/fonts/Allo-ExtraBold.otf"), weight: 800 },
    ],
  },
];

export function useAppFonts() {
  const [loaded, error] = useFonts(faces);

  return !loaded && !error;
}
