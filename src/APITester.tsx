import { useRef, type FormEvent } from "react";

export function APITester() {
  const responseInputRef = useRef<HTMLTextAreaElement>(null);

  const testEndpoint = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const endpoint = formData.get("endpoint") as string;
      const url = new URL(endpoint, location.href);
      const method = formData.get("method") as string;
      const res = await fetch(url, { method });

      const data = await res.json();
      responseInputRef.current!.value = JSON.stringify(data, null, 2);
    } catch (error) {
      responseInputRef.current!.value = String(error);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 font-sans">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Thử Nghiệm API</h2>
      <p className="text-gray-600 mb-6">
        Kiểm tra các điểm cuối (endpoints) hoạt động của máy chủ REST API cục bộ.
      </p>

      <form onSubmit={testEndpoint} className="flex gap-3 mb-4">
        <select
          name="method"
          className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="GET">GET</option>
          <option value="PUT">PUT</option>
        </select>
        <input
          type="text"
          name="endpoint"
          defaultValue="/api/hello"
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          placeholder="/api/hello"
        />
        <button
          type="submit"
          className="px-6 py-2 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Gửi
        </button>
      </form>
      <textarea
        ref={responseInputRef}
        readOnly
        placeholder="Phản hồi từ máy chủ sẽ hiển thị ở đây..."
        className="w-full h-80 p-4 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 overflow-auto font-mono text-sm resize-none focus:outline-none"
      />
    </div>
  );
}
