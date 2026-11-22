import type { ReactNode } from "react";
import type { QuestionType } from "../../../types/formBuilder";
import {
  calculationIcon,
  calendarIcon,
  choiceMultiIcon,
  choiceSingleIcon,
  fileIcon,
  imageChoiceIcon,
  matrixIcon,
  npsIcon,
  numberIcon,
  rankingIcon,
  ratingIcon,
  scaleIcon,
  textIcon,
  toggleIcon,
} from "../../../components/ui/icons";

// The question types in the picker: everyday ones first, the rest under "Advanced". The list is
// the project's own QuestionType (14 types), not the 11 of an older design: nothing is dropped.
export const BASIC_TYPES: QuestionType[] = [
  "TEXT",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "CHOICE_SINGLE",
  "CHOICE_MULTI",
];
export const ADVANCED_TYPES: QuestionType[] = [
  "IMAGE_CHOICE",
  "RATING",
  "SCALE",
  "NPS",
  "RANKING",
  "MATRIX",
  "FILE",
  "CALCULATION",
];
export const ALL_TYPES: QuestionType[] = [...BASIC_TYPES, ...ADVANCED_TYPES];

export const TYPE_ICONS: Record<QuestionType, ReactNode> = {
  TEXT: textIcon,
  NUMBER: numberIcon,
  BOOLEAN: toggleIcon,
  DATE: calendarIcon,
  CHOICE_SINGLE: choiceSingleIcon,
  CHOICE_MULTI: choiceMultiIcon,
  IMAGE_CHOICE: imageChoiceIcon,
  RATING: ratingIcon,
  SCALE: scaleIcon,
  NPS: npsIcon,
  RANKING: rankingIcon,
  MATRIX: matrixIcon,
  FILE: fileIcon,
  CALCULATION: calculationIcon,
};
