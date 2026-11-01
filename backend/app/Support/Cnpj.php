<?php

namespace App\Support;

class Cnpj
{
    public static function normalize(string $value): string
    {
        return str_replace(['.', '/', '-'], '', strtoupper(trim($value)));
    }

    public static function isValid(string $value): bool
    {
        $cnpj = self::normalize($value);
        if (! preg_match('/^[A-Z0-9]{12}[0-9]{2}$/D', $cnpj) || preg_match('/^(.)\1{13}$/D', $cnpj)) {
            return false;
        }

        $base = substr($cnpj, 0, 12);
        $first = self::digit($base);

        return $cnpj === $base.$first.self::digit($base.$first);
    }

    private static function digit(string $base): string
    {
        $sum = 0;
        $weight = strlen($base) - 7;
        foreach (str_split($base) as $character) {
            $sum += (ord($character) - 48) * $weight;
            $weight = $weight === 2 ? 9 : $weight - 1;
        }
        $remainder = $sum % 11;

        return $remainder < 2 ? '0' : (string) (11 - $remainder);
    }
}
