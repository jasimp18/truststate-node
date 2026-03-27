/**
 * Policy Library
 *
 * Pre-built templates, clone-and-customize, dry run preview.
 */

export {
  ALL_TEMPLATES,
  ALL_PACKS,
  getTemplateById,
  getPackById,
  getTemplatesByPack,
  searchTemplates,
} from './templates';

export type { PolicyTemplate, PolicyPack } from './templates';

export { LibraryService } from './library-service';
