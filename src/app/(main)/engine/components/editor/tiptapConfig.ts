import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import Placeholder from '@tiptap/extension-placeholder';
import { KeywordMark } from './KeywordMark';
import { WeakCopyMark } from './WeakCopyMark';

export const getTiptapExtensions = (placeholderText: string = 'Start writing...') => [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
    // @ts-ignore - StarterKit may define link depending on tiptap version; explicitly disable to prevent duplicate extension warning
    link: false,
  }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      class: 'text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800 transition-colors cursor-pointer',
    },
  }),
  Image.configure({
    HTMLAttributes: {
      class: 'rounded-xl border shadow-sm my-6 max-w-full h-auto',
    },
  }),
  Youtube.configure({
    width: 480,
    height: 270,
    HTMLAttributes: {
      class: 'mx-auto rounded-xl shadow-lg border-4 border-white my-8 block',
    },
    allowFullscreen: true,
  }),
  Placeholder.configure({
    placeholder: placeholderText,
    emptyEditorClass: 'is-editor-empty before:content-[attr(data-placeholder)] before:text-slate-400 before:float-left before:pointer-events-none',
  }),
  KeywordMark,
  WeakCopyMark,
];
