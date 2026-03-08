import { useState, useRef, useEffect } from "react";
import { transcribeText } from "../engine/index.ts";
import "./index.css";

const STORAGE_KEY = "cevio-transcriber-input";

export function App() {
  // Initialize from localStorage or empty
  const [input, setInput] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  const [output, setOutput] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Save input to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, input);
    } catch {
      // silently fail if localStorage not available
    }
  }, [input]);

  // Real-time transcription with debounce
  useEffect(() => {
    if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);

    if (!input.trim()) {
      setOutput("");
      return;
    }

    timeoutRef.current = setTimeout(() => {
      const result = transcribeText(input);
      setOutput(result);
    }, 100);

    return () => {
      if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);
    };
  }, [input]);

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
  };

  const handleClear = () => {
    setInput("");
    setOutput("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Vietnamese → CeVIO
          </h1>
          <p className="text-lg text-gray-600">Transcribe as you type</p>
        </div>

        {/* Main Container */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <label htmlFor="input" className="block text-sm font-semibold text-gray-700 mb-3">
              Vietnamese Text
            </label>
            <textarea
              id="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type Vietnamese... (kiên phương dương)"
              rows={14}
              autoFocus
              className="w-full h-96 p-4 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm"
            />
            <button
              onClick={handleClear}
              className="mt-4 w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Output Panel */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              CeVIO Phonemes (tone-aware)
            </label>
            <pre className="w-full h-96 p-4 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 overflow-auto font-mono text-sm whitespace-pre-wrap break-words">
              {output || (
                <span className="text-gray-400">
                  Output will appear here as you type...
                </span>
              )}
            </pre>
            <button
              onClick={handleCopy}
              disabled={!output}
              className="mt-4 w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {output ? "Copy" : "Nothing to copy"}
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="mt-8 text-center text-sm text-gray-600">
          <p>Supports Northern Vietnamese (Hanoi) phonology</p>
        </div>
      </div>
    </div>
  );
}

export default App;
