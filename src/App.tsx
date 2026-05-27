import { useState, useRef, useEffect } from "react";
import { transcribeText } from "../engine/vmora/index.ts";
import { APITester } from "./APITester.tsx";
import "./index.css";

const STORAGE_KEY = "cevio-transcriber-input";

export function App() {
  const [route, setRoute] = useState(() => {
    const hash = window.location.hash;
    if (hash === "#/guide" || hash === "#/integration") return "guide";
    if (hash === "#/api-test") return "api-test";
    return "transcribe";
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === "#/guide" || hash === "#/integration") {
        setRoute("guide");
      } else if (hash === "#/api-test") {
        setRoute("api-test");
      } else {
        setRoute("transcribe");
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const [input, setInput] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  const [output, setOutput] = useState("");
  const [copyStatus, setCopyStatus] = useState("Sao chép");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, input);
    } catch {
      // fail silently
    }
  }, [input]);

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
    void navigator.clipboard.writeText(output);
    setCopyStatus("Đã sao chép!");
    setTimeout(() => setCopyStatus("Sao chép"), 2000);
  };

  const handleClear = () => {
    setInput("");
    setOutput("");
  };

  const navigateTo = (newRoute: string) => {
    if (newRoute === "guide") {
      window.location.hash = "#/guide";
    } else if (newRoute === "api-test") {
      window.location.hash = "#/api-test";
    } else {
      window.location.hash = "#/";
    }
  };

  // Hằng số typography cao cấp
  const MONO_FONT =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  const SANS_FONT =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const codeStyle = {
    fontFamily: MONO_FONT,
    backgroundColor: "#f3f4f6",
    padding: "0.125rem 0.375rem",
    borderRadius: "0.25rem",
    fontSize: "0.875rem",
    color: "#1f2937",
    fontWeight: "500",
  };

  return (
    <div
      className="min-h-screen p-8 sm:p-12"
      style={{
        background: "#ffffff",
        color: "#111827",
        fontFamily: SANS_FONT,
        letterSpacing: "-0.015em",
      }}
    >
      <div className="mx-auto max-w-6xl">
        {/* Tiêu đề chính */}
        <header
          className="mb-12 pb-6"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderBottom: "1px solid #f3f4f6",
            gap: "1.5rem",
          }}
        >
          <div>
            <h1
              className="text-4xl font-bold text-gray-900 mb-2"
              style={{ letterSpacing: "-0.04em", fontWeight: "800", fontSize: "2.5rem" }}
            >
              Cephome
            </h1>
            <p
              className="text-lg text-gray-600"
              style={{
                fontSize: "0.9375rem",
                fontWeight: "400",
                color: "#4b5563",
                letterSpacing: "-0.01em",
              }}
            >
              Hệ thống chuyển đổi âm vị cho hệ thống hát máy CEVIO & NEUTRINO
            </p>
          </div>

          {/* Thanh Điều Hướng */}
          <nav style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
            <button
              onClick={() => navigateTo("transcribe")}
              className="font-medium"
              style={{
                width: "auto",
                padding: "0.5rem 0",
                backgroundColor: "transparent",
                color: route === "transcribe" ? "#2563eb" : "#9ca3af",
                borderBottom:
                  route === "transcribe" ? "2px solid #2563eb" : "2px solid transparent",
                borderRadius: "0",
                fontSize: "0.9375rem",
                fontWeight: route === "transcribe" ? "600" : "500",
                transition: "all 0.2s ease",
              }}
            >
              Phiên Dịch
            </button>
            <button
              onClick={() => navigateTo("guide")}
              className="font-medium"
              style={{
                width: "auto",
                padding: "0.5rem 0",
                backgroundColor: "transparent",
                color: route === "guide" ? "#2563eb" : "#9ca3af",
                borderBottom: route === "guide" ? "2px solid #2563eb" : "2px solid transparent",
                borderRadius: "0",
                fontSize: "0.9375rem",
                fontWeight: route === "guide" ? "600" : "500",
                transition: "all 0.2s ease",
              }}
            >
              Tích Hợp
            </button>
            <a
              href="https://github.com/hUwUtao/cephome"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium"
              style={{
                padding: "0.5rem 0",
                color: "#9ca3af",
                textDecoration: "none",
                fontSize: "0.9375rem",
                transition: "all 0.2s ease",
                display: "inline-block",
                fontWeight: "500",
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = "#2563eb")}
              onMouseOut={(e) => (e.currentTarget.style.color = "#9ca3af")}
            >
              Github
            </a>
          </nav>
        </header>

        {/* Khung nội dung */}
        <main style={{ marginTop: "2rem", marginBottom: "2rem" }}>
          {route === "transcribe" && (
            <div className="grid lg:grid-cols-2 gap-10" style={{ marginTop: "1rem" }}>
              {/* Bảng nhập văn bản */}
              <section
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <label
                    htmlFor="input"
                    className="block text-sm font-semibold mb-3"
                    style={{
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#6b7280",
                      fontWeight: "600",
                    }}
                  >
                    Văn Bản Tiếng Việt
                  </label>
                  <textarea
                    id="input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Nhập chữ Tiếng Việt ở đây... (Ví dụ: kiên phương dương)"
                    rows={14}
                    autoFocus
                    className="w-full h-96 p-4 border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                    style={{
                      borderRadius: "0.75rem",
                      borderColor: "#e5e7eb",
                      fontFamily: MONO_FONT,
                      fontSize: "0.875rem",
                      lineHeight: "1.6",
                      background: "#fdfdfd",
                    }}
                  />
                </div>
                <button
                  onClick={handleClear}
                  className="mt-4 w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  style={{
                    borderRadius: "0.75rem",
                    padding: "0.625rem 1rem",
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  Xóa
                </button>
              </section>

              {/* Bảng xuất âm vị */}
              <section
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <label
                    className="block text-sm font-semibold mb-3"
                    style={{
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#6b7280",
                      fontWeight: "600",
                    }}
                  >
                    Âm vị Tiếng Nhật
                  </label>
                  <pre
                    className="w-full h-96 p-4 bg-gray-50 border rounded-lg text-gray-900 overflow-auto text-sm whitespace-pre-wrap break-words"
                    style={{
                      borderRadius: "0.75rem",
                      borderColor: "#e5e7eb",
                      fontFamily: MONO_FONT,
                      fontSize: "0.875rem",
                      lineHeight: "1.6",
                    }}
                  >
                    {output || (
                      <span style={{ color: "#9ca3af", fontStyle: "italic" }}>
                        Âm vị phiên dịch sẽ xuất hiện ở đây khi bạn gõ chữ...
                      </span>
                    )}
                  </pre>
                </div>
                <button
                  onClick={handleCopy}
                  disabled={!output}
                  className="mt-4 w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
                  style={{
                    borderRadius: "0.75rem",
                    padding: "0.625rem 1rem",
                    fontSize: "0.875rem",
                    fontWeight: "600",
                  }}
                >
                  {output ? copyStatus : "Không có dữ liệu"}
                </button>
              </section>
            </div>
          )}

          {route === "guide" && (
            <article style={{ marginTop: "1rem", marginBottom: "1rem" }}>
              <h2
                className="text-4xl font-bold text-gray-900 mb-6"
                style={{ fontSize: "1.5rem", letterSpacing: "-0.03em", fontWeight: "800" }}
              >
                Cách sử dụng với NEUTRINO
              </h2>

              <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: "2rem" }}>
                {/* Custom Modern Step List */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "1.25rem" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "1.75rem",
                        height: "1.75rem",
                        borderRadius: "50%",
                        backgroundColor: "#eff6ff",
                        color: "#2563eb",
                        fontWeight: "700",
                        fontSize: "0.8125rem",
                      }}
                    >
                      1
                    </div>
                    <div
                      style={{
                        fontSize: "0.9375rem",
                        lineHeight: "1.7",
                        color: "#374151",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      Tải chương trình chạy:
                      <a
                        href="./musicXMLtoLabel.exe"
                        download
                        className="bg-blue-600 text-white font-semibold text-center rounded-lg"
                        style={{
                          display: "inline-block",
                          padding: "0.25rem 0.75rem",
                          fontSize: "0.8125rem",
                          textDecoration: "none",
                          marginLeft: "0.5rem",
                          borderRadius: "0.5rem",
                        }}
                      >
                        Tải musicXMLtoLabel.exe
                      </a>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start", gap: "1.25rem" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "1.75rem",
                        height: "1.75rem",
                        borderRadius: "50%",
                        backgroundColor: "#eff6ff",
                        color: "#2563eb",
                        fontWeight: "700",
                        fontSize: "0.8125rem",
                      }}
                    >
                      2
                    </div>
                    <div
                      style={{
                        fontSize: "0.9375rem",
                        lineHeight: "1.7",
                        color: "#374151",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      Tải về bộ quy tắc âm vị mới nhất:
                      <a
                        href="./rule.js"
                        download
                        className="bg-blue-600 text-white font-semibold text-center rounded-lg"
                        style={{
                          display: "inline-block",
                          padding: "0.25rem 0.75rem",
                          fontSize: "0.8125rem",
                          textDecoration: "none",
                          marginLeft: "0.5rem",
                          borderRadius: "0.5rem",
                        }}
                      >
                        Tải rule.js
                      </a>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start", gap: "1.25rem" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "1.75rem",
                        height: "1.75rem",
                        borderRadius: "50%",
                        backgroundColor: "#fef2f2",
                        color: "#ef4444",
                        fontWeight: "700",
                        fontSize: "0.8125rem",
                      }}
                    >
                      ★
                    </div>
                    <div
                      style={{
                        fontSize: "0.9375rem",
                        lineHeight: "1.7",
                        color: "#374151",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      Xem bản Demo Timeline trực quan:
                      <a
                        href="./lathuyenuocmo.musicxml.player.html"
                        target="_blank"
                        className="bg-purple-600 text-white font-semibold text-center rounded-lg"
                        style={{
                          display: "inline-block",
                          padding: "0.25rem 0.75rem",
                          fontSize: "0.8125rem",
                          textDecoration: "none",
                          marginLeft: "0.5rem",
                          borderRadius: "0.5rem",
                        }}
                      >
                        Lá Thư Yêu Ước Mơ (Player)
                      </a>
                      <a
                        href="./emlamamnoncuadang.musicxml.player.html"
                        target="_blank"
                        className="bg-purple-600 text-white font-semibold text-center rounded-lg"
                        style={{
                          display: "inline-block",
                          padding: "0.25rem 0.75rem",
                          fontSize: "0.8125rem",
                          textDecoration: "none",
                          marginLeft: "0.5rem",
                          borderRadius: "0.5rem",
                        }}
                      >
                        Em Làm Mầm Non Của Đảng (Player)
                      </a>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start", gap: "1.25rem" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "1.75rem",
                        height: "1.75rem",
                        borderRadius: "50%",
                        backgroundColor: "#eff6ff",
                        color: "#2563eb",
                        fontWeight: "700",
                        fontSize: "0.8125rem",
                      }}
                    >
                      3
                    </div>
                    <div
                      style={{
                        fontSize: "0.9375rem",
                        lineHeight: "1.7",
                        color: "#374151",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      Sao chép cả 2 tệp vừa tải ở trên và dán đè vào thư mục{" "}
                      <code style={codeStyle}>NEUTRINO/bin</code> trong thư mục cài đặt{" "}
                      <code style={codeStyle}>NEUTRINO</code> của bạn (hãy đổi tên file{" "}
                      <code style={codeStyle}>musicXMLtoLabel.exe</code> có sẵn).
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start", gap: "1.25rem" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "1.75rem",
                        height: "1.75rem",
                        borderRadius: "50%",
                        backgroundColor: "#eff6ff",
                        color: "#2563eb",
                        fontWeight: "700",
                        fontSize: "0.8125rem",
                      }}
                    >
                      4
                    </div>
                    <div
                      style={{
                        fontSize: "0.9375rem",
                        lineHeight: "1.7",
                        color: "#374151",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      Soạn tập nhạc musicXML (nên xuất từ Musescore) viết bằng kiểu quốc ngữ (kiểu
                      UTF-8/UNICODE).
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start", gap: "1.25rem" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "1.75rem",
                        height: "1.75rem",
                        borderRadius: "50%",
                        backgroundColor: "#eff6ff",
                        color: "#2563eb",
                        fontWeight: "700",
                        fontSize: "0.8125rem",
                      }}
                    >
                      5
                    </div>
                    <div
                      style={{
                        fontSize: "0.9375rem",
                        lineHeight: "1.7",
                        color: "#374151",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      Chạy phần mềm tạo nhạc NEUTRINO để tạo giọng hát như bình thường. Chương trình
                      sẽ tự động hát Tiếng Việt chuẩn xác!
                    </div>
                  </div>
                </div>
              </div>
            </article>
          )}

          {route === "api-test" && (
            <article style={{ marginTop: "1rem", marginBottom: "1rem" }}>
              <APITester />
            </article>
          )}
        </main>

        {/* Chân trang */}
        <footer
          className="mt-12 text-center text-sm"
          style={{
            fontSize: "0.8125rem",
            color: "#9ca3af",
            paddingTop: "2.5rem",
            borderTop: "1px solid #f3f4f6",
          }}
        >
          <p>Dựa theo âm vị và thanh điệu của Tiếng Việt miền bắc (Hà Nội)</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
