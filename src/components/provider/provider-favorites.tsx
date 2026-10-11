"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { RequestRepModal } from "@/components/provider/request-rep-modal";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import { Heart, Phone, Plus, Star, Trash2 } from "lucide-react";
import { LoadingState } from "@/components/ui/loading";

interface FavoriteRep {
  id: string;
  name: string;
  phone: string | null;
  company: { name: string } | null;
  repProfile: {
    status: string;
    credentialStatus: string;
    products: string[];
  } | null;
}

export function ProviderFavoritesPage({ userName }: { userName: string }) {
  const [favorites, setFavorites] = useState<FavoriteRep[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string; products: string[] }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [preferredRepId, setPreferredRepId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [favData, compData] = await Promise.all([
        fetchJson<FavoriteRep[]>("/api/favorites"),
        fetchJson<{ id: string; name: string; products: string[] }[]>("/api/companies"),
      ]);
      setFavorites(Array.isArray(favData) ? favData : []);
      setCompanies(Array.isArray(compData) ? compData : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load favorites");
      setFavorites([]);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function removeFavorite(repId: string) {
    try {
      await fetch(`/api/favorites?repId=${repId}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove favorite");
    }
  }

  function quickRequest(repId: string) {
    setPreferredRepId(repId);
    setShowModal(true);
  }

  return (
    <PortalShell portal="provider" userName={userName}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Favorite Reps</h1>
          <p className="text-sm text-slate-600">Quick re-book your trusted reps</p>
        </div>
        <Button onClick={() => { setPreferredRepId(undefined); setShowModal(true); }} disabled={companies.length === 0}>
          <Plus className="h-4 w-4" />
          New Request
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <LoadingState />
      ) : favorites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <Heart className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-4 text-slate-600">No favorite reps yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Favorite a rep from an active request to re-book them quickly.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map((rep) => (
            <div key={rep.id} className="rounded-xl border border-slate-200/80 bg-white shadow-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{rep.name}</h3>
                  <p className="text-sm text-slate-500">{rep.company?.name}</p>
                </div>
                <Star className="h-5 w-5 fill-rose-400 text-rose-400" />
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => quickRequest(rep.id)}>Quick Request</Button>
                {rep.phone && (
                  <a href={`tel:${rep.phone}`} className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50">
                    <Phone className="h-3.5 w-3.5" />
                  </a>
                )}
                <Button size="sm" variant="ghost" onClick={() => removeFavorite(rep.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && companies.length > 0 && (
        <RequestRepModal
          companies={companies}
          preferredRepId={preferredRepId}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); load(); }}
        />
      )}
    </PortalShell>
  );
}
