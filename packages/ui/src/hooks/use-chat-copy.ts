"use client"

import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

type ChatCopy = TFunction<"chat">

const useChatCopy = (): ChatCopy => useTranslation("chat").t

export { type ChatCopy, useChatCopy }
