// src/app/page.tsx
import EdlForm from "../components/EdlForm";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
            Express EDL
          </h1>
          <p className="text-slate-500 font-medium">
            Créez votre état des lieux pro en 5 minutes.
          </p>
        </div>

        <EdlForm />
      </div>
    </main>
  );
}