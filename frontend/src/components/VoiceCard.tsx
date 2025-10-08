"use client";

type Props = {
  id: string;
  name: string;
  avatar: string;
  selectedId: string | null;
  onSelectAction: (id: string) => void;
};

export default function VoiceCard({ id, name, avatar, selectedId, onSelectAction }: Props) {
  const selected = selectedId === id;
  return (
    <div
      onClick={() => onSelectAction(id)}
      className="w-full cursor-pointer select-none bg-white rounded-2xl p-4 flex items-center gap-3 hover:shadow-md transition"
    >
      {/* Circular Checkbox */}
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${selected ? 'bg-[#F7A120] border-[#F7A120]' : 'bg-white border-neutral-300'}`}>
        {selected && (
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
            <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>

      <img
        src={avatar}
        alt={name}
        className="w-12 h-12 rounded-full object-cover"
      />
      <div className="flex-1">
        <p className="font-semibold text-base">{name}</p>
        <p className="text-xs text-neutral-500 mt-0.5">AI Voice</p>
      </div>
      <button
        className="w-12 h-12 rounded-full bg-[#C8102E] flex items-center justify-center text-white hover:bg-[#A00D25] transition flex-shrink-0 shadow-md hover:shadow-lg"
        title="Preview voice"
      >
        <svg width="14" height="16" viewBox="0 0 14 16" fill="none" className="ml-0.5">
          <path d="M2 1L13 8L2 15V1Z" fill="white" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}


