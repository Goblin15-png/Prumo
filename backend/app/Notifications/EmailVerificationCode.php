<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class EmailVerificationCode extends Notification
{
    public function __construct(public readonly string $code) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->from('bernadin15.dev@gmail.com', 'PRUMA ESSENTIAL')
            ->subject('Seu código de confirmação — PRUMA ESSENTIAL')
            ->greeting('Olá, '.$notifiable->name)
            ->line('Digite este código no site para confirmar seu email:')
            ->line($this->code)
            ->line('O código expira em 10 minutos e só pode ser usado uma vez. Ao solicitar outro, o anterior deixa de valer.')
            ->line('Se você não solicitou este código, ignore esta mensagem. Não compartilhe o código.');
    }
}
