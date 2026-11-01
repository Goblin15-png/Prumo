<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SupportController extends Controller
{
    private function tickets(Request $request)
    {
        $query = DB::table('support_tickets');
        if (! $request->routeIs('admin.support.*')) {
            $query->where('support_tickets.user_id', $request->user()->id);
        }

        return $query;
    }

    public function index(Request $request)
    {
        $data = $request->validate(['status' => ['nullable', 'in:open,closed'], 'page' => ['nullable', 'integer', 'min:1']]);
        $query = $this->tickets($request)->join('users', 'users.id', '=', 'support_tickets.user_id')
            ->select('support_tickets.*', 'users.name as distributor_name');
        if (! empty($data['status'])) {
            $query->where('support_tickets.status', $data['status']);
        }

        return response()->json($query->orderByDesc('support_tickets.updated_at')->orderByDesc('support_tickets.id')->paginate(20));
    }

    public function show(Request $request, int $id)
    {
        $ticket = $this->tickets($request)->where('support_tickets.id', $id)->first();
        abort_unless($ticket, 404);

        return response()->json([
            'ticket' => $ticket,
            'messages' => DB::table('support_messages')->where('ticket_id', $id)->orderBy('id')->get(['id', 'body', 'from_admin', 'created_at']),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:150'],
            'body' => ['required', 'string', 'max:4000'],
        ]);
        $id = DB::transaction(function () use ($request, $data) {
            $id = DB::table('support_tickets')->insertGetId([
                'user_id' => $request->user()->id, 'subject' => $data['subject'], 'status' => 'open',
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('support_messages')->insert([
                'ticket_id' => $id, 'user_id' => $request->user()->id, 'from_admin' => false,
                'body' => $data['body'], 'created_at' => now(), 'updated_at' => now(),
            ]);

            return $id;
        });

        return response()->json(['id' => $id], 201);
    }

    public function reply(Request $request, int $id)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:4000']]);
        DB::transaction(function () use ($request, $id, $data) {
            $ticket = $this->tickets($request)->where('support_tickets.id', $id)->lockForUpdate()->first();
            abort_unless($ticket, 404);
            abort_if($ticket->status === 'closed', 422, 'Este chamado está encerrado.');
            DB::table('support_messages')->insert([
                'ticket_id' => $id, 'user_id' => $request->user()->id,
                'from_admin' => $request->routeIs('admin.support.*'), 'body' => $data['body'],
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('support_tickets')->where('id', $id)->update(['updated_at' => now()]);
        });

        return response()->noContent();
    }

    public function status(Request $request, int $id)
    {
        $data = $request->validate(['status' => ['required', 'in:open,closed']]);
        DB::transaction(function () use ($request, $id, $data) {
            $ticket = $this->tickets($request)->where('support_tickets.id', $id)->lockForUpdate()->first();
            abort_unless($ticket, 404);
            DB::table('support_tickets')->where('id', $id)->update([...$data, 'updated_at' => now()]);
        });

        return response()->noContent();
    }
}
