"use client"

import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

type CommonCopy = TFunction<"common">

const useCommonCopy = (): CommonCopy => useTranslation("common").t

export { type CommonCopy, useCommonCopy }
