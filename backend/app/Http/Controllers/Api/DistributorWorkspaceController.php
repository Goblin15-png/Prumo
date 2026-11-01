<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Validation\Rule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DistributorWorkspaceController extends Controller
{
    public function index(Request $request)
    {
        return response()->json([
            'products' => Product::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'inventory' => DB::table('distributor_inventory')->where('user_id', $request->user()->id)->orderBy('product_name')->get(),
            'plans' => DB::table('distributor_purchase_plans')->where('user_id', $request->user()->id)->orderBy('planned_date')->get(),
        ]);
    }

    public function saveInventory(Request $request, ?int $id = null)
    {
        return $this->save($request, 'distributor_inventory', $request->validate([
            'product_id' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            'quantity' => ['required', 'integer', 'min:0', 'max:1000000'],
            'minimum_quantity' => ['required', 'integer', 'min:0', 'max:1000000'],
        ]), $id);
    }

    public function savePlan(Request $request, ?int $id = null)
    {
        return $this->save($request, 'distributor_purchase_plans', $request->validate([
            'product_id' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            'quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
            'planned_date' => ['required', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]), $id);
    }

    private function save(Request $request, string $table, array $data, ?int $id)
    {
        $product = Product::where('is_active', true)->findOrFail($data['product_id']);
        $data['product_name'] = $product->name;
        $data['updated_at'] = now();
        if ($id !== null) {
            $query = DB::table($table)->where('id', $id)->where('user_id', $request->user()->id);
            abort_unless($query->exists(), 404);
            $query->update($data);
        } else {
            $id = DB::table($table)->insertGetId([...$data, 'user_id' => $request->user()->id, 'created_at' => now()]);
        }

        return response()->json(['item' => DB::table($table)->find($id)], $request->isMethod('post') ? 201 : 200);
    }

    public function deleteInventory(Request $request, int $id)
    {
        return $this->delete($request, 'distributor_inventory', $id);
    }

    public function deletePlan(Request $request, int $id)
    {
        return $this->delete($request, 'distributor_purchase_plans', $id);
    }

    private function delete(Request $request, string $table, int $id)
    {
        abort_unless(DB::table($table)->where('user_id', $request->user()->id)->where('id', $id)->delete(), 404);

        return response()->noContent();
    }
}
