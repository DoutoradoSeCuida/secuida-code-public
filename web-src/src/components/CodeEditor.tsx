import { useEffect, useRef } from 'react';
import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, temporarilySetTabFocusMode } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import type { Language } from '../types/sdk';
export type EditorProps = { value: string; language: Language; onChange: (value: string) => void; readOnly?: boolean; height?: number };
const externalChange = Annotation.define<boolean>();
const colors = HighlightStyle.define([
  { tag: tags.keyword, color: '#c6a5ef' },
  { tag: [tags.string, tags.special(tags.string)], color: '#edbb99' },
  { tag: [tags.number, tags.bool, tags.null], color: '#b5dca6' },
  { tag: tags.comment, color: '#99b38d', fontStyle: 'italic' },
  { tag: [tags.typeName, tags.className], color: '#67d4c5' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#efdc96' },
  { tag: [tags.variableName, tags.propertyName], color: '#a9d9f5' },
  { tag: [tags.operator, tags.punctuation], color: '#e4edf5' },
]);
export function CodeEditor({ value, language, onChange, readOnly,height }: EditorProps) {
  const host = useRef<HTMLDivElement>(null); const view = useRef<EditorView | null>(null);
  const onEdit = useRef(onChange); onEdit.current = onChange;
  const sizing=useRef(new Compartment());
  const syntax = useRef(new Compartment()); const access = useRef(new Compartment());
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({ parent: host.current, state: EditorState.create({ doc: value, extensions: [
      sizing.current.of(EditorView.theme({'&':{height:`${height || 320}px`}})),syntax.current.of([]), access.current.of([]), lineNumbers(), history(), bracketMatching(),
      highlightActiveLine(), highlightActiveLineGutter(), drawSelection(), syntaxHighlighting(colors),
      placeholder('Escreva ou cole sua tentativa aqui…'),
      keymap.of([{ key: 'Escape', run: temporarilySetTabFocusMode }, indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorView.contentAttributes.of({ 'aria-label': 'Código da sua tentativa', 'aria-describedby': 'editor-keys', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
      EditorView.theme({
        '&': { backgroundColor: '#142334', color: '#e4edf5', overflow: 'hidden' },
        '&.cm-focused': { outline: '2px solid #76b4ff', outlineOffset: '-2px' },
        '.cm-content': { fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", monospace', padding: '14px 0', fontSize: '14px', lineHeight: '1.65', caretColor: '#fff' },
        '.cm-gutters': { backgroundColor: '#102030', color: '#9bafc3', border: 'none', minWidth: '42px' },
        '.cm-activeLineGutter, .cm-activeLine': { backgroundColor: '#ffffff09' },
        '.cm-cursor': { borderLeftColor: '#fff' }, '.cm-scroller': { overflow: 'auto' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#315477 !important' },
        '.cm-matchingBracket': { backgroundColor: '#366268', outline: '1px solid #67d4c5' },
        '.cm-placeholder': { color: '#a9bdce' },
      }, { dark: true }),
      EditorView.updateListener.of(update => { if (update.docChanged && !update.transactions.some(t => t.annotation(externalChange))) onEdit.current(update.state.doc.toString()); }),
    ] }) });
    view.current = editor; return () => { editor.destroy(); view.current = null; };
  }, []);
  useEffect(()=>{view.current?.dispatch({effects:sizing.current.reconfigure(EditorView.theme({'&':{height:`${height || 320}px`}}))});},[height]);
  useEffect(() => { view.current?.dispatch({ effects: syntax.current.reconfigure(language === 'python' ? python() : language === 'javascript' ? javascript() : language === 'java' ? java() : cpp()) }); }, [language]);
  useEffect(() => { view.current?.dispatch({ effects: access.current.reconfigure([EditorState.readOnly.of(!!readOnly), EditorView.editable.of(!readOnly)]) }); }, [readOnly]);
  useEffect(() => { const editor = view.current; if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value }, annotations: externalChange.of(true) }); }, [value]);
  return <div ref={host} style={{ minWidth: 0, width: '100%' }} />;
}
