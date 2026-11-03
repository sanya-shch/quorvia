import type { TFunction } from "i18next";
import {
  calendarIcon,
  choiceMultiIcon,
  choiceSingleIcon,
  npsIcon,
  numberIcon,
  ratingIcon,
  rankingIcon,
  scaleIcon,
  textIcon,
  toggleIcon,
} from "../../components/ui/icons";
import { QUESTION_TYPE_LABEL_KEYS } from "../../constants";
import type { QuestionType } from "../../types/formBuilder";

interface SidebarItem {
  type: QuestionType;
  label: string;
  icon: string | React.ReactNode;
}

// Функція, а не статичний масив: підписи мають перераховуватись при зміні
// мови, а не застигати на момент першого завантаження модуля.
export const getSidebarItems = (t: TFunction): SidebarItem[] => [
  { type: "TEXT", label: t(QUESTION_TYPE_LABEL_KEYS.TEXT), icon: textIcon },
  { type: "NUMBER", label: t(QUESTION_TYPE_LABEL_KEYS.NUMBER), icon: numberIcon },
  {
    type: "CHOICE_SINGLE",
    label: t(QUESTION_TYPE_LABEL_KEYS.CHOICE_SINGLE),
    icon: choiceSingleIcon,
  },
  { type: "CHOICE_MULTI", label: t(QUESTION_TYPE_LABEL_KEYS.CHOICE_MULTI), icon: choiceMultiIcon },
  { type: "BOOLEAN", label: t(QUESTION_TYPE_LABEL_KEYS.BOOLEAN), icon: toggleIcon },
  {
    type: "DATE",
    label: t(QUESTION_TYPE_LABEL_KEYS.DATE),
    icon: calendarIcon,
  },
  { type: "RATING", label: t(QUESTION_TYPE_LABEL_KEYS.RATING), icon: ratingIcon },
  { type: "SCALE", label: t(QUESTION_TYPE_LABEL_KEYS.SCALE), icon: scaleIcon },
  { type: "NPS", label: t(QUESTION_TYPE_LABEL_KEYS.NPS), icon: npsIcon },
  { type: "RANKING", label: t(QUESTION_TYPE_LABEL_KEYS.RANKING), icon: rankingIcon },
];
