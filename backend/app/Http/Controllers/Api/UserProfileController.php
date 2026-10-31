<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UserProfileRequest;
use App\Services\RecommendationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserProfileController extends Controller
{
    public function __construct(
        protected RecommendationService $recommendationService
    ) {}

    /**
     * Salva ou atualiza o questionário de onboarding do utilizador
     */
    public function storeOrUpdate(UserProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $profileData = $request->validated();
        unset($profileData['health_data_consent']);
        $profileData['health_data_consented_at'] = now();
        $profileData['health_data_consent_version'] = config('app.health_questionnaire_consent_version');

        $profile = $user->profile()->updateOrCreate(
            ['user_id' => $user->id],
            $profileData
        );

        // Recarrega o relacionamento no modelo do usuário
        $user->setRelation('profile', $profile);

        // Busca de imediato os produtos recomendados para o novo perfil
        $recommendations = $this->recommendationService->getRecommendationsForUser($user);

        return response()->json([
            'message' => 'Perfil e preferências atualizados com sucesso!',
            'profile' => $profile,
            'recommendations' => $recommendations,
        ], 200);
    }

    /**
     * Retorna os produtos recomendados para o utilizador autenticado
     */
    public function recommendations(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user) {
            $recommendations = $this->recommendationService->getRecommendationsForUser($user);
            $profile = $user->profile;
            $userProblem = $profile && $profile->hasHealthDataConsent()
                ? $profile->problema_principal
                : null;
        } else {
            $recommendations = $this->recommendationService->getFallbackBestSellers();
            $userProblem = null;
        }

        return response()->json([
            'user_problem' => $userProblem,
            'data' => $recommendations,
        ]);
    }

    /**
     * Retorna o perfil atual do usuário autenticado
     */
    public function show(Request $request): JsonResponse
    {
        $profile = $request->user()->profile;

        return response()->json([
            'profile' => $profile,
        ]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $request->user()->profile()->delete();

        return response()->json(['message' => 'Questionário e dados do perfil removidos.']);
    }
}
