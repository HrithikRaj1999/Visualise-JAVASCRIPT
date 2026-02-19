import React from "react";
import { createPortal } from "react-dom";
import { useFontSize } from "../../context/FontSizeContext";

function IconSettings({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

export function TextSizeControl({ boxId }: { boxId: string }) {
  const { scale, setSize } = useFontSize(boxId);
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        // Also check if clicking inside the dropdown (which is now in a portal-like state effectively)
        const dropdown = document.getElementById(`dropdown-${boxId}`);
        if (dropdown && !dropdown.contains(event.target as Node)) {
          setIsOpen(false);
        }
      }
    };

    // Update position on scroll/resize if open
    const updatePos = () => {
      if (isOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 5,
          left: rect.right - 80, // Align right edge roughly
        });
      }
    };

    if (isOpen) {
      updatePos();
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", updatePos, true);
      window.addEventListener("resize", updatePos);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [isOpen, boxId]);

  const handleToggle = () => {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 5,
        left: rect.right - 80,
      });
    }
    setIsOpen(!isOpen);
  };

  const steps = [
    { label: "XS", value: 0.8 },
    { label: "S", value: 1.0 },
    { label: "M", value: 1.2 },
    { label: "L", value: 1.5 },
    { label: "XL", value: 2.0 },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors relative z-50"
        title="Adjust Text Size"
      >
        <IconSettings className="h-4 w-4" />
      </button>

      {isOpen &&
        createPortal(
          <div
            id={`dropdown-${boxId}`}
            className="fixed z-[9999] flex flex-col gap-0.5 rounded-md border border-slate-700 bg-[#0d1117] p-1 shadow-xl min-w-[70px]"
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
            }}
          >
            {steps.map((step) => (
              <button
                key={step.label}
                onClick={() => {
                  setSize(step.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                  Math.abs(scale - step.value) < 0.01
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {step.label} {(step.value * 100).toFixed(0)}%
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
