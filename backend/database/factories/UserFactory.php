<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<User> */
class UserFactory extends Factory
{
    protected $model = User::class;

    public function definition(): array
    {
        return [
            'name' => 'Pessoa fictícia',
            'email' => fake()->unique()->safeEmail(),
            'password' => 'test-only-password',
            'role' => 'customer',
        ];
    }
}
