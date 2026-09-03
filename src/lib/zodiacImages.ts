import type { ZodiacSign } from "@/lib/themes";
import ariesImage from "@/assets/zodiac/aries.jpg";
import taurusImage from "@/assets/zodiac/taurus.jpg";
import geminiImage from "@/assets/zodiac/gemini.jpg";
import cancerImage from "@/assets/zodiac/cancer.jpg";
import leoImage from "@/assets/zodiac/leo.jpg";
import virgoImage from "@/assets/zodiac/virgo.jpg";
import libraImage from "@/assets/zodiac/libra.jpg";
import scorpioImage from "@/assets/zodiac/scorpio.jpg";
import sagittariusImage from "@/assets/zodiac/sagittarius.jpg";
import capricornImage from "@/assets/zodiac/capricorn.jpg";
import aquariusImage from "@/assets/zodiac/aquarius.jpg";
import piscesImage from "@/assets/zodiac/pisces.jpg";

export interface ZodiacArtworkData {
  image: string;
  title: string;
  defaultColor: string;
  palette: string[];
}

export const ZODIAC_ARTWORKS: Record<ZodiacSign, ZodiacArtworkData> = {
  aries: {
    image: ariesImage,
    title: "Aries the Ram",
    defaultColor: "#8c1d13",
    palette: [
      "#8c1d13", // Vermilion cinnabar
      "#d49b28", // Golden sun & fleece
      "#2e5737", // Verdant meadow hill
      "#570d0a", // Deep crimson wine
      "#264973", // Lapis lazuli blossom
    ],
  },
  taurus: {
    image: taurusImage,
    title: "Taurus the Bull",
    defaultColor: "#143575",
    palette: [
      "#143575", // Royal lapis blue trellis
      "#c99b2e", // Golden rosette stars
      "#b8823b", // Tawny ochre bull
      "#2f592f", // Forest meadow grass
      "#c8452e", // Coral blossom
    ],
  },
  gemini: {
    image: geminiImage,
    title: "Gemini the Twins",
    defaultColor: "#163778",
    palette: [
      "#163778", // Royal lapis blue sky
      "#bd422b", // Vermilion red robe
      "#d5a439", // Golden amber hair & trellis
      "#2b693e", // Malachite green bird & lawn
      "#ded4b8", // Parchment scroll & dove
    ],
  },
  cancer: {
    image: cancerImage,
    title: "Cancer the Crab",
    defaultColor: "#152e5a",
    palette: [
      "#152e5a", // Moonlit pond azure
      "#c04828", // Terracotta crimson crab
      "#caa23d", // Checkered sky gold
      "#e2dac6", // Crescent moon & pearls
      "#45653b", // Shoreline meadow green
    ],
  },
  leo: {
    image: leoImage,
    title: "Leo the Lion",
    defaultColor: "#b22018",
    palette: [
      "#b22018", // Vermilion cinnabar background
      "#db9e28", // Imperial crowned gold lion
      "#ded8c8", // Silver starlight acanthus scroll
      "#385a30", // Verdant grassy knoll
      "#24467c", // Ultramarine blossom
    ],
  },
  virgo: {
    image: virgoImage,
    title: "Virgo the Maiden",
    defaultColor: "#173a7c",
    palette: [
      "#173a7c", // Royal lapis trellis sky
      "#ba4824", // Terracotta orange gown
      "#c89635", // Harvest wheat sheaf gold
      "#3b633b", // Herbal meadow lawn
      "#e5dfd2", // Linen starlight veil
    ],
  },
  libra: {
    image: libraImage,
    title: "Libra the Scales",
    defaultColor: "#133777",
    palette: [
      "#133777", // Royal lapis trellis sky
      "#cfa234", // Golden scales of justice
      "#c6482a", // Terracotta sleeve & flower
      "#edeae0", // Alabaster white blossom
      "#3b5c33", // Mossy lawn & stems
    ],
  },
  scorpio: {
    image: scorpioImage,
    title: "Scorpio the Scorpion",
    defaultColor: "#a8241b",
    palette: [
      "#a8241b", // Checkered sky vermilion
      "#1b3e82", // Checkered sky lapis
      "#caa235", // Eight-pointed star gold
      "#221d18", // Scorpion chitin obsidian
      "#ded8cb", // Star point starlight
    ],
  },
  sagittarius: {
    image: sagittariusImage,
    title: "Sagittarius the Archer",
    defaultColor: "#bd261b",
    palette: [
      "#bd261b", // Vermilion cinnabar sky
      "#d8a436", // Archer's star, bow & path
      "#1a4388", // Starry blue mantle
      "#356133", // Emerald rolling hills
      "#ded8c8", // Silver acanthus scroll
    ],
  },
  capricorn: {
    image: capricornImage,
    title: "Capricorn the Mountain Goat",
    defaultColor: "#143575",
    palette: [
      "#143575", // Royal lapis trellis
      "#bcb49c", // Stone tower limestone
      "#c69b35", // Gilded trellis gold
      "#36592d", // Alpine meadow grass
      "#b84025", // Russet blossom
    ],
  },
  aquarius: {
    image: aquariusImage,
    title: "Aquarius the Water-Bearer",
    defaultColor: "#1c52a8",
    palette: [
      "#1c52a8", // River of stars azure
      "#dca836", // Golden amphora & stars
      "#122d64", // Royal lapis backdrop
      "#b84725", // Terracotta tunic warmth
      "#385e35", // Meadow herbal lawn
    ],
  },
  pisces: {
    image: piscesImage,
    title: "Pisces the Fishes",
    defaultColor: "#2662a6",
    palette: [
      "#2662a6", // Marine azure pool
      "#d2d6d8", // Silver-scaled fishes
      "#c99c35", // Checkered gold tile
      "#b83828", // Coral vermilion fins & tile
      "#486d38", // Scalloped basin jade green
    ],
  },
};
