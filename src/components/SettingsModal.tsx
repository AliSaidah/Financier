import { useState } from "react";
import { Check, Info, LayoutDashboard, Plus, Trash2, User, X } from "lucide-react";
import { useFinancierStore, UserProfile } from "../store/useFinancierStore";

interface Props {
  onClose: () => void;
}

const AVATAR_COLORS = [
  "bg-emerald-600", "bg-blue-600", "bg-violet-600",
  "bg-rose-600", "bg-amber-600", "bg-cyan-600",
];
function avatarColor(id: string) {
  let n = 0;
  for (let i = 0; i < id.length; i++) n += id.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function UserRow({
  user, isActive, canDelete, onSwitch, onDelete,
}: {
  user: UserProfile; isActive: boolean; canDelete: boolean;
  onSwitch: () => void; onDelete: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
      isActive ? "bg-accentPositive/10 ring-1 ring-accentPositive/20" : "bg-white/[0.03] hover:bg-white/[0.06]"
    }`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accentPositive text-white">
        <User size={14} />
      </div>
      <span className={`flex-1 truncate text-sm font-medium ${isActive ? "text-accentPositive" : "text-slate-200"}`}>
        {user.name}
      </span>
      {isActive && (
        <span className="flex items-center gap-1 rounded-full bg-accentPositive/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accentPositive">
          <Check size={10} /> Ativo
        </span>
      )}
      {!isActive && (
        <button onClick={onSwitch} className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-accentPositive/20 hover:text-accentPositive">
          Usar
        </button>
      )}
      {canDelete && (
        <button onClick={onDelete} className="ml-1 rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-500/20 hover:text-rose-400" title="Excluir usuário">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

export function SettingsModal({ onClose }: Props) {
  const { users, activeUserId, addUser, removeUser, switchUser, setActiveTab } = useFinancierStore();
  const [newName, setNewName] = useState("");
  const [showInput, setShowInput] = useState(false);

  const handleAdd = () => {
    if (!newName.trim()) return;
    addUser(newName.trim());
    setNewName("");
    setShowInput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
    if (e.key === "Escape") { setNewName(""); setShowInput(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <User size={16} className="text-accentPositive" />
            <h2 className="text-sm font-semibold text-white">Configurações</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">

          {/* Users */}
          <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">Usuários</p>
          <div className="space-y-1.5">
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isActive={user.id === activeUserId}
                canDelete={users.length > 1}
                onSwitch={() => { switchUser(user.id); onClose(); }}
                onDelete={() => removeUser(user.id)}
              />
            ))}
          </div>

          {/* Painel Gerencial — consolida todos os usuários */}
          {users.length > 1 && (
            <button
              onClick={() => { setActiveTab("painel"); onClose(); }}
              className="mt-3 flex w-full items-center gap-2.5 rounded-xl bg-accentPositive/10 px-3 py-2.5 ring-1 ring-accentPositive/20 transition hover:bg-accentPositive/15"
            >
              <LayoutDashboard size={15} className="shrink-0 text-accentPositive" />
              <span className="flex-1 text-left text-sm font-medium text-accentPositive">Painel Gerencial</span>
              <span className="text-[10px] text-accentPositive/70">consolida {users.length} usuários</span>
            </button>
          )}

          {/* Add user */}
          <div className="mt-3">
            {showInput ? (
              <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 ring-1 ring-white/[0.08]">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Nome do usuário"
                  maxLength={32}
                  className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
                />
                <button onClick={handleAdd} disabled={!newName.trim()} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-accentPositive/20 hover:text-accentPositive disabled:opacity-30">
                  <Check size={14} />
                </button>
                <button onClick={() => { setNewName(""); setShowInput(false); }} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowInput(true)} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-white/[0.08] px-3 py-2.5 text-sm text-slate-500 transition hover:border-accentPositive/30 hover:text-accentPositive">
                <Plus size={14} />
                Novo usuário
              </button>
            )}
          </div>

          {/* About */}
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Sobre</p>
            <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2.5">
              <Info size={14} className="shrink-0 text-slate-500" />
              <span className="text-sm text-slate-400">Financier</span>
              <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-slate-500">
                v0.1.1
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
