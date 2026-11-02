import React, { useState } from "react";
import { useNavigate } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

const FAQ_ITEMS = [
  {
    question: "How do I create a bundle?",
    answer:
      "Go to Bundles and discounts, click on + New bundle, choose your bundle type (volume tiers or fixed bundle), select the products or collection, set your discount, and then publish it. You can scope the bundle to specific collections if needed.",
  },
  {
    question: "How do post purchase offers work?",
    answer:
      "Post purchase offers appear right after the customer completes their payment, before the order confirmation page. You can create an offer with a product and a discount, set the targeting rules, and publish it. When a customer accepts the offer, the product is automatically added to their order.",
  },
  {
    question: "How do recommendation sets work?",
    answer:
      "Recommendation sets show frequently bought together or related products on your product pages, cart drawer, or other placements. Create a set, choose the products or collection, and publish it. You can customize where the recommendations appear and the display style.",
  },
  {
    question: "Can I apply offers to specific collections?",
    answer:
      "Yes. When creating a bundle, post purchase offer, or recommendation set, you can choose to apply it to specific collections. This helps you target the right products and customers.",
  },
];

export default function ContactUsPage() {
  const navigate = useNavigate();
  // By default, the first FAQ is expanded matching the reference design
  const [openIndices, setOpenIndices] = useState(() => new Set([0]));

  const toggleFaq = (index) => {
    setOpenIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 select-none pb-20 font-sans">
      <main className="max-w-[840px] mx-auto px-4 sm:px-6 pt-8">
        {/* Back navigation */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => navigate("/app")}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-950 transition group cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-700 group-hover:border-slate-400 group-hover:bg-slate-50 transition">
              ←
            </span>
            <span>Back to dashboard</span>
          </button>
        </div>

        {/* Header matching screenshot */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 mb-1">
            Contact us
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-normal">
            Have a question, feedback, or need help? We&apos;re here for you.
          </p>
        </div>

        {/* Get in touch Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 mb-8 flex items-center gap-4 sm:gap-5">
          {/* Circular Email Icon */}
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#FFF2EE] flex items-center justify-center shrink-0">
            <svg
              className="w-6 h-6 sm:w-7 sm:h-7 text-[#F95738]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>

          {/* Text Content */}
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-slate-950">
              Get in touch
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
              Email us at{" "}
              <a
                href="mailto:support@cartelevate.com"
                className="font-semibold text-[#F95738] hover:underline cursor-pointer"
              >
                hello@explified.com
              </a>{" "}
              and our team will get back to you as soon as possible, typically within 24 hours on business days.
            </p>
          </div>
        </div>

        {/* Common questions Section */}
        <div className="space-y-3">
          <div className="mb-4">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-950 mb-1">
              Common questions
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-normal">
              Find quick answers to the most common questions about CartElevate.
            </p>
          </div>

          {/* Accordion FAQ Items */}
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, index) => {
              const isOpen = openIndices.has(index);

              return (
                <div
                  key={item.question}
                  className={`rounded-2xl border transition-all duration-150 ${
                    isOpen
                      ? "bg-[#FFF7F5] border-[#FDDCD3]/80 shadow-2xs"
                      : "bg-white border-slate-200/90 hover:border-slate-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(index)}
                    className="w-full text-left p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <span className="text-xs sm:text-sm font-bold text-slate-950 leading-snug">
                      {item.question}
                    </span>
                    <span className="text-slate-700 shrink-0">
                      {isOpen ? (
                        <svg
                          className="w-4 h-4 sm:w-5 sm:h-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="18 15 12 9 6 15" />
                        </svg>
                      ) : (
                        <svg
                          className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      )}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-0">
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                        {item.answer}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
