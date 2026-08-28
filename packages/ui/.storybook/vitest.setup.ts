import { getProjectAnnotations } from "virtual:/@storybook/builder-vite/project-annotations.js"

import { setProjectAnnotations } from "storybook/preview-api"

setProjectAnnotations(getProjectAnnotations())
