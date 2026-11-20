import { useParams } from "react-router-dom";
import AnalyticsHeader from "./components/AnalyticsHeader";
import VueAnalyticsHost from "./components/VueAnalyticsHost";

export default function FormAnalyticsPage() {
  const { formId } = useParams<{ formId: string }>();

  if (!formId) return <div className="p-6 text-rose-500 font-bold">Form ID missing</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AnalyticsHeader formId={formId} wide />
      <div className="flex-1">
        <VueAnalyticsHost formId={formId} />
      </div>
    </div>
  );
}
