<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Symptom;
use App\Models\UserProfile;
use Carbon\Carbon;

class AudienceMetricsService
{
    public const MINIMUM_GROUP_SIZE = 5;

    public function report(): array
    {
        $registered = Symptom::where('active', true)->orderBy('name')->pluck('name');
        // Mantém as opções antigas reconhecidas enquanto a taxonomia é consolidada.
        $allowed = $registered->merge([
            'Ansiedade / Estresse', 'Dor de Cabeça / Enxaqueca', 'Insônia / Sono',
            'Dores Musculares / Tensão', 'Foco / Concentração', 'TPM / Saúde Hormonal Feminina',
        ])->unique();
        $channels = ['Instagram', 'Indicação de Amigos', 'Loja Física', 'Pesquisa no Google', 'TikTok', 'Kwai', 'Outros'];
        $genders = ['Feminino', 'Masculino', 'Outro', 'Prefiro não dizer'];
        $counts = [];
        $demographics = ['acquisition' => [], 'gender' => [], 'age' => []];
        $cross = [];
        $total = 0;
        foreach (UserProfile::query()->whereIn('id', UserProfile::query()->selectRaw('MAX(id)')->groupBy('user_id'))->consentedToHealthData()->select(['problema_principal', 'canal_aquisicao', 'sexo', 'data_nascimento'])->cursor() as $profile) {
            $total++;
            $complaint = $allowed->contains($profile->problema_principal) ? $profile->problema_principal : 'Other';
            $counts[$complaint] = ($counts[$complaint] ?? 0) + 1;
            $dimensions = [
                'acquisition' => in_array($profile->canal_aquisicao, $channels, true) ? $profile->canal_aquisicao : 'Não informado',
                'gender' => in_array($profile->sexo, $genders, true) ? $profile->sexo : 'Não informado',
                'age' => $this->ageBand($profile->data_nascimento),
            ];
            foreach ($dimensions as $dimension => $label) {
                $demographics[$dimension][$label] = ($demographics[$dimension][$label] ?? 0) + 1;
                $key = json_encode([$dimension, $label, $complaint], JSON_THROW_ON_ERROR);
                if (! isset($cross[$key])) {
                    $cross[$key] = ['dimension' => $dimension, 'label' => $label, 'complaint' => $complaint, 'count' => 0];
                }
                $cross[$key]['count']++;
            }
        }
        $visible = collect($counts)->filter(fn ($count) => $count >= self::MINIMUM_GROUP_SIZE)->sortDesc();
        $audience = [];
        foreach ($demographics as $dimension => $groups) {
            $audience[$dimension] = collect($groups)->filter(fn ($count) => $count >= self::MINIMUM_GROUP_SIZE)->sortDesc()
                ->map(fn ($count, $label) => ['label' => $label, 'count' => $count, 'percentage' => $total ? round(100 * $count / $total, 1) : 0])->values()->all();
        }
        $coverage = $registered->map(function ($name) use ($counts) {
            $available = Product::targetingSymptom($name)->where('is_active', true)->where('stock', '>', 0)->count();
            $count = $counts[$name] ?? 0;

            return [
                'symptom' => $name, 'client_interest_count' => $count >= self::MINIMUM_GROUP_SIZE ? $count : null,
                'client_interest_suppressed' => $count < self::MINIMUM_GROUP_SIZE,
                'products_available_count' => $available,
                'status' => $available === 0 ? 'Crítico: Sem produto ativo' : ($available < 2 ? 'Atenção: Pouca variedade' : 'Adequado'),
            ];
        })->all();

        return [
            'total_clients_analyzed' => $total,
            'minimum_group_size' => self::MINIMUM_GROUP_SIZE,
            'symptoms_distribution' => $visible->map(fn ($count, $name) => ['problema' => $name, 'count' => $count, 'percentage' => $total ? round(100 * $count / $total, 1) : 0])->values()->all(),
            'complaints' => $visible->map(fn ($count, $name) => ['complaint' => $name, 'count' => $count])->values()->all(),
            'audience' => $audience,
            'complaint_by_audience' => collect($cross)->filter(fn ($row) => $row['count'] >= self::MINIMUM_GROUP_SIZE)->sortByDesc('count')->values()->all(),
            'demand_mapping' => $coverage,
        ];
    }

    private function ageBand(?string $birthDate): string
    {
        if (! $birthDate) {
            return 'Não informado';
        }
        try {
            $date = Carbon::createFromFormat('!Y-m-d', $birthDate);
            if (! $date || $date->format('Y-m-d') !== $birthDate || $date->isFuture()) {
                return 'Não informado';
            }
            $age = (int) $date->diffInYears(now());

            return match (true) {
                $age < 18 => 'Até 17', $age < 25 => '18–24', $age < 35 => '25–34',
                $age < 45 => '35–44', $age < 55 => '45–54', $age < 65 => '55–64',
                $age <= 120 => '65+', default => 'Não informado',
            };
        } catch (\Throwable) {
            return 'Não informado';
        }
    }
}
