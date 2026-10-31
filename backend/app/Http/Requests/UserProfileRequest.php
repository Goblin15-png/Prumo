<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UserProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'sexo' => [
                'required',
                Rule::in(['Feminino', 'Masculino', 'Outro', 'Prefiro não dizer']),
            ],
            'data_nascimento' => ['nullable', 'date', 'before:today'],
            'numero_telefone' => ['nullable', 'string', 'max:30'],
            'problema_principal' => ['required', 'string', 'max:150'],
            'health_data_consent' => ['accepted'],
            'canal_aquisicao' => [
                'nullable',
                'string',
                Rule::in([
                    'Instagram',
                    'Indicação de Amigos',
                    'Loja Física',
                    'Pesquisa no Google',
                    'TikTok',
                    'Kwai',
                    'Outros',
                ]),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'sexo.required' => 'Selecione uma opção para continuar o questionário.',
            'sexo.in' => 'Opção inválida.',
            'data_nascimento.before' => 'A data de nascimento deve ser uma data passada.',
            'problema_principal.required' => 'Informe uma queixa ou escolha “Outro” para personalizar suas recomendações.',
            'health_data_consent.accepted' => 'Confirme que deseja usar seus dados para personalizar recomendações.',
        ];
    }
}
