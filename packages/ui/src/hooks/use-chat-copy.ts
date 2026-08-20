"use client"

import { useTranslation } from "react-i18next"

/** Reads the chat namespace. Exported so a host composing these components can
 * name the few strings it hands down as props without taking the translation
 * runtime as a dependency of its own. */
const useChatCopy = () => useTranslation("chat").t

export { useChatCopy }
