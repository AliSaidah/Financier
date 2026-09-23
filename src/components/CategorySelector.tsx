import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Check, ChevronDown, Link2, PenLine, Search, X } from "lucide-react";
import { CategoryGroup } from "../data/constants";
import { getExpenseCategoryId } from "../data/categoryResolver";
import { useFinancierStore } from "../store/useFinancierStore";

interface Props {
  value: string;
  subCategory?: string;
  groups: CategoryGroup[];
  categoryType: "income" | "expense";
  onSelect: (value: string, subCategory?: string) => void;
}

const CUSTOM_GROUP = "Minhas Categorias";
const DEFAULT_EXPANDED: Record<string, boolean> = { [CUSTOM_GROUP]: true };

export function CategorySelector({ value, subCategory, groups, categoryType, onSelect }: Props) {
  const hasValue = Boolean(value) && value !== "Sem categoria";
  // ID canônico da categoria atual (resolve nome/alias → id), para casar grupo selecionado
  const currentId = useMemo(() => (hasValue ? getExpenseCategoryId(value) : undefined), [value, hasValue]);

  // Um grupo "casa" com a categoria atual se o nome bater ou se resolver ao mesmo id canônico
  function groupMatches(groupName: string): boolean {
    if (groupName === value) return true;
    const gid = getExpenseCategoryId(groupName);
    return Boolean(gid && currentId && gid === currentId);
  }
  // Um item específico está selecionado (subcategoria de despesa, ou item direto de receita/custom)
  function itemSelected(groupName: string, item: string): boolean {
    if (item === value) return true;
    if (subCategory && item === subCategory && groupMatches(groupName)) return true;
    return false;
  }
  const customCategories   = useFinancierStore((s) =>
    categoryType === "income" ? s.customCategoriesIncome : s.customCategoriesExpense
  );
  const customSubItems     = useFinancierStore((s) =>
    categoryType === "income" ? s.customSubItemsIncome : s.customSubItemsExpense
  );
  const addCustomCategory    = useFinancierStore((s) => s.addCustomCategory);
  const removeCustomCategory = useFinancierStore((s) => s.removeCustomCategory);
  const addCustomSubItem     = useFinancierStore((s) => s.addCustomSubItem);
  const removeCustomSubItem  = useFinancierStore((s) => s.removeCustomSubItem);

  const [open, setOpen]               = useState(false);
  const [search, setSearch]           = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(DEFAULT_EXPANDED);
  const [pos, setPos]                 = useState({ top: 0, left: 0 });
  const [enteringCustom, setEnteringCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [saveCustom, setSaveCustom]   = useState(true);
  const [saveAs, setSaveAs]           = useState<"custom" | "shortcut">("custom");
  const [shortcutParentKey, setShortcutParentKey] = useState("");

  const buttonRef      = useRef<HTMLButtonElement>(null);
  const dropdownRef    = useRef<HTMLDivElement>(null);
  const searchRef      = useRef<HTMLInputElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  function openDropdown() {
    if (!buttonRef.current) return;
    const rect  = buttonRef.current.getBoundingClientRect();
    const dropW = 300;
    const left  = Math.max(8, rect.right - dropW);
    const spaceBelow = window.innerHeight - rect.bottom;
    const top   = spaceBelow > 280 ? rect.bottom + 4 : rect.top - 284;
    setPos({ top, left });
    // Expande o grupo que contém a categoria atual, para já mostrá-la selecionada
    const expand: Record<string, boolean> = { ...DEFAULT_EXPANDED };
    for (const g of allGroups) if (groupMatches(g.group)) expand[g.group] = true;
    setExpandedGroups(expand);
    setOpen(true);
  }

  function resetCustomForm() {
    setEnteringCustom(false);
    setCustomValue("");
    setSaveAs("custom");
    setShortcutParentKey("");
  }

  useEffect(() => {
    if (!enteringCustom) return;
    setTimeout(() => customInputRef.current?.focus(), 30);
  }, [enteringCustom]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => searchRef.current?.focus(), 30);

    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setSearch("");
      resetCustomForm();
      setExpandedGroups(DEFAULT_EXPANDED);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // All groups: "Minhas Categorias" first, then standard groups with custom sub-items injected
  const allGroups = useMemo(() => {
    const withSubs = groups.map((g) => {
      const subs = customSubItems[g.group] ?? [];
      if (!subs.length) return g;
      return { group: g.group, items: [...g.items, ...subs] };
    });
    if (!customCategories.length) return withSubs;
    return [{ group: CUSTOM_GROUP, items: customCategories }, ...withSubs];
  }, [groups, customCategories, customSubItems]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allGroups;
    return allGroups
      .map((g) => ({ group: g.group, items: g.items.filter((i) => i.toLowerCase().includes(term)) }))
      .filter((g) => g.group.toLowerCase().includes(term) || g.items.length > 0);
  }, [allGroups, search]);

  function confirmCustom() {
    const cat = customValue.trim();
    if (!cat) return;

    if (saveAs === "shortcut") {
      if (!shortcutParentKey) return;
      // Always save the atalho
      addCustomSubItem(shortcutParentKey, cat, categoryType);
      const emitted = (categoryType === "expense")
        ? (getExpenseCategoryId(shortcutParentKey) ?? shortcutParentKey)
        : cat;
      const subCategory = (categoryType === "expense") ? cat : undefined;
      onSelect(emitted, subCategory);
    } else {
      if (saveCustom) addCustomCategory(cat, categoryType);
      onSelect(cat);
    }

    setOpen(false);
    setSearch("");
    resetCustomForm();
  }

  const dropdown = open
    ? createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 300, zIndex: 9999 }}
          className="overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900 shadow-2xl shadow-black/60 ring-1 ring-black/20"
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
            <Search size={13} className="shrink-0 text-slate-500" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetCustomForm(); }}
              placeholder="Buscar categoria…"
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 outline-none"
            />
          </div>

          {/* Categoria atual */}
          {hasValue && (
            <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-accentPositive/[0.06] px-3 py-1.5">
              <Check size={11} className="shrink-0 text-accentPositive" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Atual</span>
              <span className="truncate text-xs font-medium text-accentPositive">
                {value}{subCategory ? ` · ${subCategory}` : ""}
              </span>
            </div>
          )}

          {/* List */}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-slate-500">Nenhum resultado</p>
            )}

            {filtered.map((group) => {
              const isCustomGroup = group.group === CUSTOM_GROUP;
              const expanded = Boolean(expandedGroups[group.group]) || Boolean(search.trim());
              const groupSubItems = isCustomGroup ? [] : (customSubItems[group.group] ?? []);

              const groupSelected = groupMatches(group.group);

              return (
                <div key={group.group}>
                  <button
                    onClick={() => setExpandedGroups((p) => ({ ...p, [group.group]: !p[group.group] }))}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wider hover:text-slate-300 ${
                      groupSelected ? "text-accentPositive" : isCustomGroup ? "text-accentPositive/70" : "text-slate-500"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {groupSelected && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accentPositive" />}
                      {group.group}
                    </span>
                    <span className="text-slate-600">{expanded ? "−" : "+"}</span>
                  </button>

                  {expanded && (
                    <div className="pb-1">
                      {group.items.map((item) => {
                        const isCustomSub = !isCustomGroup && groupSubItems.includes(item);
                        const sel = itemSelected(group.group, item);
                        return (
                          <div
                            key={`${group.group}-${item}`}
                            className="group/item flex items-center"
                          >
                            <button
                              onClick={() => {
                                // Despesas (grupos padrão): emite o categoryId + item como subCategory
                                // Receitas / Minhas Categorias / custom sub-items: emite item como texto
                                const emitted = (categoryType === "expense" && !isCustomGroup)
                                  ? (getExpenseCategoryId(group.group) ?? group.group)
                                  : item;
                                const subCategory = (categoryType === "expense" && !isCustomGroup)
                                  ? item
                                  : undefined;
                                onSelect(emitted, subCategory);
                                setOpen(false);
                                setSearch("");
                                setExpandedGroups(DEFAULT_EXPANDED);
                              }}
                              className={`flex flex-1 items-center gap-1.5 px-5 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.05] hover:text-white ${
                                sel ? "bg-accentPositive/10 font-medium text-accentPositive" : "text-slate-300"
                              }`}
                            >
                              {isCustomSub && (
                                <Link2 size={10} className="shrink-0 text-slate-500" />
                              )}
                              <span className="flex-1">{item}</span>
                              {sel && <Check size={12} className="shrink-0 text-accentPositive" />}
                            </button>
                            {/* Delete button — only for custom categories or custom sub-items */}
                            {(isCustomGroup || isCustomSub) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isCustomGroup) {
                                    removeCustomCategory(item, categoryType);
                                  } else {
                                    removeCustomSubItem(group.group, item, categoryType);
                                  }
                                }}
                                title="Remover"
                                className="mr-2 hidden rounded p-0.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400 group-hover/item:flex"
                              >
                                <X size={11} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Outro — custom category */}
            <div className="border-t border-white/[0.06] pt-1">
              {!enteringCustom ? (
                <button
                  onClick={() => { setEnteringCustom(true); setSearch(""); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300"
                >
                  <PenLine size={12} />
                  Outro (digitar manualmente)
                </button>
              ) : (
                <div className="space-y-1.5 px-3 py-2">
                  {/* Input row */}
                  <div className="flex items-center gap-2">
                    <input
                      ref={customInputRef}
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmCustom();
                        if (e.key === "Escape") resetCustomForm();
                      }}
                      placeholder="Nome da categoria…"
                      className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder-slate-500 outline-none"
                    />
                    <button
                      onClick={confirmCustom}
                      disabled={!customValue.trim() || (saveAs === "shortcut" && !shortcutParentKey)}
                      className="shrink-0 rounded p-0.5 text-accentPositive transition hover:bg-accentPositive/10 disabled:opacity-30"
                    >
                      <Check size={13} />
                    </button>
                  </div>

                  {/* Onde salvar? */}
                  <p className="text-[10px] text-slate-500">Onde salvar?</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSaveAs("custom")}
                      className={`rounded-full px-2 py-0.5 text-[10px] transition ${
                        saveAs === "custom"
                          ? "bg-accentPositive/15 text-accentPositive"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Categoria personalizada
                    </button>
                    <button
                      onClick={() => setSaveAs("shortcut")}
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition ${
                        saveAs === "shortcut"
                          ? "bg-accentPositive/15 text-accentPositive"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      <Link2 size={9} />
                      Atalho em categoria
                    </button>
                  </div>

                  {/* Shortcut: parent selector */}
                  {saveAs === "shortcut" && (
                    <select
                      value={shortcutParentKey}
                      onChange={(e) => setShortcutParentKey(e.target.value)}
                      className="w-full rounded bg-slate-800 px-2 py-1 text-[10px] text-white outline-none"
                    >
                      <option value="">Categoria principal…</option>
                      {groups.map((g) => (
                        <option key={g.group} value={g.group}>{g.group}</option>
                      ))}
                    </select>
                  )}

                  {/* Save toggle — only for "custom" mode */}
                  {saveAs === "custom" && (
                    <button
                      onClick={() => setSaveCustom((v) => !v)}
                      className={`flex items-center gap-1.5 rounded px-1 py-0.5 text-xs transition ${
                        saveCustom
                          ? "text-accentPositive"
                          : "text-slate-600 hover:text-slate-400"
                      }`}
                    >
                      <Bookmark size={11} className={saveCustom ? "fill-accentPositive" : ""} />
                      {saveCustom ? "Salvar em Minhas Categorias" : "Usar só desta vez"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={openDropdown}
        className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-slate-800/60 px-2 py-1 text-xs text-slate-300 transition hover:border-white/20 hover:text-white"
      >
        Editar
        <ChevronDown size={11} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {dropdown}
    </div>
  );
}
