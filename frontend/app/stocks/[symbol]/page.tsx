import StockDetailView from "@/components/StockDetailView";
import { fetchStockDetail } from "@/lib/api";
import { notFound } from "next/navigation";

export default async function StockPage({
    params,
}: {
    params: Promise<{ symbol: string }>;
}) {
    const { symbol } = await params;

    let stock;
    try {
        stock = await fetchStockDetail(decodeURIComponent(symbol));
    } catch {
        notFound();
    }

    return <StockDetailView stock={stock} />;
}