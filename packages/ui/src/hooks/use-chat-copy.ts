"use client"

import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

/** Reads the chat namespace. Both are exported so a host composing these
 * components can name the strings it hands down — as props, or from a producer
 * taking the translator as a parameter — without taking the translation runtime
 * as a dependency of its own. */
type ChatCopy = TFunction<"chat">

const useChatCopy = (): ChatCopy => useTranslation("chat").t

export { type ChatCopy, useChatCopy }
